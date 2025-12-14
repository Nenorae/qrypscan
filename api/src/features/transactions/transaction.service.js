// api/src/features/transactions/transaction.service.js

import pool  from '../../core/db.js';

/**
 * Fetches a list of token transactions for a specific contract address.
 * @param {string} address - The contract address.
 * @param {number} limit - The number of transactions to return.
 * @param {number} offset - The starting offset for pagination.
 * @returns {Promise<Array>} - A promise that resolves to an array of transactions.
 */
export const getTransactionsByContractAddress = async (address, limit = 25, offset = 0) => {
  
  const query = `
    SELECT
      tx_hash,
      block_number,
      block_timestamp,
      log_index,
      contract_address,
      from_address,
      to_address,
      value,
      token_id
    FROM token_transfers
    WHERE contract_address = $1
    ORDER BY block_number DESC, log_index DESC
    LIMIT $2
    OFFSET $3;
  `;
  try {
    const res = await pool.query(query, [address, limit, offset]);
    return res.rows;
  } catch (error) {
    console.error(`Error fetching transactions for address ${address}:`, error);
    throw error;
  }
};
