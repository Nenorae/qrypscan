// File: indexer/src/indexer.js

import { ethers } from "ethers";
import { getLatestBlockNumber, saveContract, processBlock } from "./db/queries.js";
import { getDbPool } from "./db/connect.js";
import { processTransactionLog } from "./tokenProcessor.js";
import { processProxyUpgradeLog } from "./proxyProcessor.js"; // Import proxy processor

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Logika untuk memastikan .env selalu ditemukan dari root proyek
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Fungsi utama untuk menjalankan proses indexing
async function startIndexer() {
  console.log("--- Memulai Historical Indexer ---");

  const provider = new ethers.JsonRpcProvider(process.env.BESU_HTTP_URL);
  const lastIndexedBlock = await getLatestBlockNumber();
  console.log(`Blok terakhir di database: #${lastIndexedBlock}`);

  const latestBlockOnChain = await provider.getBlockNumber();
  console.log(`Blok terbaru di jaringan: #${latestBlockOnChain}`);

  const startBlock = lastIndexedBlock + 1;

  if (startBlock > latestBlockOnChain) {
    console.log("✅ Database sudah sinkron. Tidak ada yang perlu di-index.");
    return;
  }

  console.log(`Memulai indexing dari blok #${startBlock} hingga #${latestBlockOnChain}...`);

  for (let blockNumber = startBlock; blockNumber <= latestBlockOnChain; blockNumber++) {
    try {
      const progress = (((blockNumber - startBlock + 1) / (latestBlockOnChain - startBlock + 1)) * 100).toFixed(2);
      console.log(`[${progress}%] Mengambil blok #${blockNumber}...`);

      const blockWithTxs = await provider.getBlock(blockNumber, true);

      if (blockWithTxs) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // 1. Process block and base transactions
          await processBlock(client, blockWithTxs);

          // 2. Process receipts and all logs
          for (const tx of blockWithTxs.prefetchedTransactions) {
            const receipt = await provider.getTransactionReceipt(tx.hash);
            if (receipt) {
              // Check for contract creation
              if (tx.to === null && receipt.contractAddress) {
                await saveContract(client, receipt, tx, blockWithTxs.timestamp, provider);
              }

              // Process logs for token transfers and proxy upgrades
              if (receipt.logs) {
                for (const log of receipt.logs) {
                  await processTransactionLog(log, blockWithTxs.timestamp, provider, client);
                  await processProxyUpgradeLog(log, client);
                }
              }
            }
          }
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      } else {
        console.warn(`⚠️ Blok #${blockNumber} tidak ditemukan.`);
      }
    } catch (error) {
      console.error(`🔥 Gagal memproses blok #${blockNumber}:`, error.message);
    }
  }

  console.log("🎉 --- Historical Indexer Selesai --- 🎉");
}

// Menjalankan fungsi utama dan menutup pool database setelah selesai
startIndexer()
  .then(() => {
    getDbPool().end(() => {
      console.log("Connection pool ditutup.");
    });
  })
  .catch((error) => {
    console.error("💥 Terjadi kesalahan fatal pada Indexer:", error);
    getDbPool().end();
    process.exit(1);
  });
