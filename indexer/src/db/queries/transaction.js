// File: indexer/src/db/queries/transaction.js
import { getDbPool } from "../connect.js";

// ======================== TRANSACTION FUNCTIONS ========================
export async function saveTransaction(client, tx, blockTimestampISO) {
  try {
    const query = `
      INSERT INTO transactions (
        tx_hash, block_number, block_timestamp, from_address, to_address,
        value_wei, gas_limit, gas_price, transaction_index, nonce, input_data,
        transaction_type, max_fee_per_gas, max_priority_fee_per_gas
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (tx_hash, block_timestamp) DO NOTHING;
    `;

    // Fungsi helper untuk menangani nilai gas
    const safeGasValue = (val) => {
      if (val === undefined || val === null) return "21000"; // Default gas limit
      const numVal = parseInt(val.toString());
      return numVal > 0 ? numVal.toString() : "21000";
    };

    // Penanganan khusus untuk transaction_index
    const transactionIndex = tx.transactionIndex !== undefined && tx.transactionIndex !== null ? tx.transactionIndex : 0; // Nilai default valid

    const values = [
      tx.hash,
      tx.blockNumber,
      blockTimestampISO,
      tx.from,
      tx.to || null,
      tx.value ? tx.value.toString() : "0", // value_wei
      safeGasValue(tx.gas), // gas_limit (dengan penanganan khusus)
      tx.gasPrice ? tx.gasPrice.toString() : "0", // gas_price
      transactionIndex,
      tx.nonce ? tx.nonce.toString() : "0", // nonce
      tx.input,
      tx.type || 0,
      tx.maxFeePerGas ? tx.maxFeePerGas.toString() : null,
      tx.maxPriorityFeePerGas ? tx.maxPriorityFeePerGas.toString() : null,
    ];

    // console.log(`ℹ️ Menyimpan transaksi ${tx.hash} dengan gas_limit: ${values[6]}`);
    await client.query(query, values);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan transaksi ${tx.hash}:`, error);
    throw error;
  }
}

export async function updateTransactionReceipt(client, receipt) {
  try {
    const query = `
      UPDATE transactions
      SET gas_used = $1, status = $2
      WHERE tx_hash = $3;
    `;

    const values = [receipt.gasUsed.toString(), receipt.status, receipt.transactionHash];

    await client.query(query, values);
    // console.log(`✅ Receipt untuk tx ${receipt.transactionHash} diperbarui.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal memperbarui receipt tx ${receipt.transactionHash}:`, error);
    throw error;
  }
}

// ======================== BATCH PROCESSING ========================
export async function batchProcessTransactions(receipts) {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const receipt of receipts) {
      await updateTransactionReceipt(client, receipt);
    }

    await client.query("COMMIT");
    console.log(`✅ ${receipts.length} receipt transaksi diproses.`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`❌ Gagal memproses batch receipt:`, error);
    throw error;
  } finally {
    client.release();
  }
}
