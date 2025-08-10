// File: indexer/src/db/queries/block.js
import { getDbPool } from "../connect.js";
import { saveTransaction } from "./transaction.js";

// ======================== BLOCK FUNCTIONS ========================
export async function saveBlock(client, block) {
  try {
    const blockTimestampISO = new Date(block.timestamp * 1000).toISOString();

    // Handle undefined difficulty values
    const difficulty = block.difficulty ? block.difficulty.toString() : "0";
    const totalDifficulty = block.totalDifficulty ? block.totalDifficulty.toString() : "0";

    const query = `
      INSERT INTO blocks (
        block_number, block_hash, parent_hash, block_timestamp, 
        miner, gas_used, gas_limit, transaction_count, 
        base_fee_per_gas, extra_data, size_bytes, difficulty, total_difficulty
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (block_number, block_timestamp) DO NOTHING;
    `;

    const values = [
      block.number,
      block.hash,
      block.parentHash,
      blockTimestampISO,
      block.miner,
      block.gasUsed.toString(),
      block.gasLimit.toString(),
      block.transactions.length,
      block.baseFeePerGas ? block.baseFeePerGas.toString() : null,
      block.extraData,
      block.size || null, // Handle possible undefined size
      difficulty,
      totalDifficulty,
    ];

    await client.query(query, values);
    console.log(`✅ Blok #${block.number} berhasil disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan blok #${block.number}:`, error);
    throw error;
  }
}

// ======================== BLOCK PROCESSING ========================
export async function getLatestBlockNumber() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT MAX(block_number) AS latest_number FROM blocks;");
    return parseInt(res.rows[0].latest_number || "-1", 10);
  } finally {
    client.release();
  }
}

export async function processBlock(client, block) {
  // Safety check to ensure we have a valid block object.
  if (!block || typeof block.timestamp === "undefined") {
    console.error("Invalid or incomplete block object received in processBlock:", block);
    throw new Error(`processBlock called with invalid block object. Block number: ${block?.number}`);
  }

  const blockTimestampISO = new Date(block.timestamp * 1000).toISOString();

  // Simpan blok
  await saveBlock(client, block);

  // Simpan transaksi
  if (block.prefetchedTransactions?.length > 0) {
    for (const tx of block.prefetchedTransactions) {
      await saveTransaction(client, tx, blockTimestampISO);
    }
  }

  console.log(`✅ Blok #${block.number} diproses.`);
  return true;
}