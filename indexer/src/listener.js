// File: indexer/src/listener.js

import { ethers } from "ethers";
import { getDbPool } from "./db/connect.js";
import { processBlock, saveContract } from "./db/queries.js";
import { processTransactionLog } from "./tokenProcessor.js";
import { processProxyUpgradeLog } from "./proxyProcessor.js"; // Import proxy processor

export async function startListener() {
  const BESU_WS_URL = process.env.BESU_WS_URL;
  if (!BESU_WS_URL) {
    throw new Error("❌ Variabel environment BESU_WS_URL tidak ditemukan. Mohon atur di file .env");
  }

  console.log(`📡 Mencoba terhubung ke node Besu via WebSocket di: ${BESU_WS_URL}`);

  const provider = new ethers.WebSocketProvider(BESU_WS_URL);

  console.log("🥣 Mangkuk siap! Mendengarkan blok baru...");

  provider.on("block", async (blockNumber) => {
    try {
      console.log(`📦 Blok baru terdeteksi! Nomor: ${blockNumber}`);

      const blockWithTxs = await provider.getBlock(blockNumber, true);

      if (blockWithTxs) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // 1. Process the block and its base transactions
          await processBlock(client, blockWithTxs);

          // 2. Process receipts and logs for each transaction
          for (const tx of blockWithTxs.prefetchedTransactions) {
            const receipt = await provider.getTransactionReceipt(tx.hash);
            if (receipt) {
              // Check for contract creation
              if (tx.to === null && receipt.contractAddress) {
                await saveContract(client, receipt, tx, blockWithTxs.timestamp, provider);
              }

              // Process all logs for token transfers and proxy upgrades
              if (receipt.logs) {
                for (const log of receipt.logs) {
                  // Pass the DB client to ensure all log processing is in the same transaction
                  await processTransactionLog(log, blockWithTxs.timestamp, provider, client);
                  await processProxyUpgradeLog(log, client);
                }
              }
            }
          }

          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e; // Re-throw the error to be caught by the outer catch block
        } finally {
          client.release();
        }
      } else {
        console.warn(`⚠️ Tidak dapat mengambil detail untuk blok #${blockNumber}`);
      }
    } catch (error) {
      console.error(`🔥 Terjadi kesalahan saat memproses blok #${blockNumber}:`, error);
    }
  });

  provider.websocket.on("error", (error) => {
    console.error("WebSocket Error:", error);
  });
}
