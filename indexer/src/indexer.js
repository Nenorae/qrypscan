// File: indexer/src/indexer.js

import { ethers } from "ethers";
import { getLatestBlockNumber, saveContract } from "./db/queries.js";
import { getDbPool } from "./db/connect.js";
import { processBlock } from "./db/queries.js"; // Ganti saveBlockAndTransactions dengan processBlock
import { processTransactionLog } from "./tokenProcessor.js"; // Import fungsi untuk memproses logs transaksi

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

  // Menggunakan provider HTTP untuk tugas batch ini
  const provider = new ethers.JsonRpcProvider(process.env.BESU_HTTP_URL);

  // 1. Cek blok terakhir di database kita
  const lastIndexedBlock = await getLatestBlockNumber();
  console.log(`Blok terakhir di database: #${lastIndexedBlock}`);

  // 2. Cek blok terbaru di jaringan blockchain
  const latestBlockOnChain = await provider.getBlockNumber();
  console.log(`Blok terbaru di jaringan: #${latestBlockOnChain}`);

  const startBlock = lastIndexedBlock + 1;

  if (startBlock > latestBlockOnChain) {
    console.log("✅ Database sudah sinkron. Tidak ada yang perlu di-index.");
    return;
  }

  console.log(`Memulai indexing dari blok #${startBlock} hingga #${latestBlockOnChain}...`);

  // 3. Loop dari blok yang hilang hingga blok terbaru
  for (let blockNumber = startBlock; blockNumber <= latestBlockOnChain; blockNumber++) {
    try {
      // Memberi log progres agar kita tahu prosesnya berjalan
      const progress = (((blockNumber - startBlock + 1) / (latestBlockOnChain - startBlock + 1)) * 100).toFixed(2);
      console.log(`[${progress}%] Mengambil blok #${blockNumber}...`);

      const blockWithTxs = await provider.getBlock(blockNumber, true); // `true` untuk ambil transaksi

      if (blockWithTxs) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await processBlock(client, blockWithTxs);

          for (const tx of blockWithTxs.prefetchedTransactions) {
            const receipt = await provider.getTransactionReceipt(tx.hash);
            if (receipt) {
              // Cek jika ini adalah transaksi pembuatan kontrak
              if (tx.to === null && receipt.contractAddress) {
                await saveContract(client, receipt, tx, blockWithTxs.timestamp);
              }

              // Proses logs untuk token transfers
              if (receipt.logs) {
                for (const log of receipt.logs) {
                  await processTransactionLog(log, blockWithTxs.timestamp, provider);
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
      // Anda bisa memilih untuk berhenti atau lanjut. Untuk saat ini, kita biarkan lanjut.
    }
  }

  console.log("🎉 --- Historical Indexer Selesai --- 🎉");
}

// Menjalankan fungsi utama dan menutup pool database setelah selesai
startIndexer()
  .then(() => {
    // Menutup semua koneksi di pool agar skrip bisa berhenti dengan bersih
    getDbPool().end(() => {
      console.log("Connection pool ditutup.");
    });
  })
  .catch((error) => {
    console.error("💥 Terjadi kesalahan fatal pada Indexer:", error);
    getDbPool().end();
    process.exit(1);
  });
