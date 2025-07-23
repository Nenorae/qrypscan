// src/features/transactions/transaction.model.js
import db from "../../core/db.js";

export const getTransactionByHash = async (hash) => {
  const { rows } = await db.query("SELECT * FROM transactions WHERE tx_hash = $1", [hash]);
  return rows[0];
};

export const getLatestTransactions = async (limit) => {
  const { rows } = await db.query("SELECT * FROM transactions ORDER BY block_timestamp DESC, transaction_index DESC LIMIT $1", [limit]);
  return rows;
};

// Fungsi ini juga digunakan oleh resolver Block
export const getTransactionsByBlockNumber = async (blockNumber) => {
  const { rows } = await db.query("SELECT * FROM transactions WHERE block_number = $1 ORDER BY transaction_index ASC", [blockNumber]);
  return rows;
};

// Fungsi ini digunakan oleh service Address
export const getTransactionsByAddress = async (address) => {
  // [PERBAIKAN] Gunakan LOWER() untuk pencarian case-insensitive
  const { rows } = await db.query("SELECT * FROM transactions WHERE LOWER(from_address) = LOWER($1) OR LOWER(to_address) = LOWER($1) ORDER BY block_timestamp DESC", [address]);
  return rows;
};

export const getPaginatedTransactions = async ({ page, limit }) => {
  const offset = (page - 1) * limit;
  const { rows } = await db.query(
    "SELECT * FROM transactions ORDER BY block_timestamp DESC, transaction_index DESC LIMIT $1 OFFSET $2",
    [limit, offset]
  );
  return rows;
};

export const getTotalTransactionCount = async () => {
  const { rows } = await db.query('SELECT COUNT(*) AS total FROM transactions');
  return parseInt(rows[0].total, 10);
};
