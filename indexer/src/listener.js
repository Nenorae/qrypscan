// File: indexer/src/listener.js (Versi Perbaikan)

import { ethers } from "ethers";
import { getDbPool } from "./db/connect.js"; // <-- Tambahkan import ini
import { processBlock, saveContract } from "./db/queries.js";
import { processTransactionLog } from "./tokenProcessor.js";

export async function startListener() {
  const BESU_WS_URL = process.env.BESU_WS_URL;
  if (!BESU_WS_URL) {
    throw new Error("❌ Variabel environment BESU_WS_URL tidak ditemukan. Mohon atur di file .env");
  }

  console.log(`📡 Mencoba terhubung ke node Besu via WebSocket di: ${BESU_WS_URL}`);

  const provider = new ethers.WebSocketProvider(BESU_WS_URL);

  console.log("🥣 Mangkuk siap! Mendengarkan blok baru...");

  // Mendengarkan blok baru yang diterima dari node
  provider.on("block", async (blockNumber) => {
    try {
      console.log(`📦 Blok baru terdeteksi! Nomor: ${blockNumber}`);

      const blockWithTxs = await provider.getBlock(blockNumber, true);

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
        console.warn(`⚠️ Tidak dapat mengambil detail untuk blok #${blockNumber}`);
      }
    } catch (error) {
      console.error(`🔥 Terjadi kesalahan saat memproses blok #${blockNumber}:`, error);
    }
  });

  // Menambahkan listener untuk error koneksi WebSocket jika diperlukan
  provider.websocket.on("error", (error) => {
    console.error("WebSocket Error:", error);
  });
}
