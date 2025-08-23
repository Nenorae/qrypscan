// File: indexer/src/db/queries/log.js

/**
 * Menyimpan raw event log ke dalam tabel event_logs.
 * @param {object} client - Node-postgres client.
 * @param {object} log - Objek log dari Ethers.
 * @param {number} blockTimestamp - Timestamp dari blok.
 */
export async function saveRawLog(client, log, blockTimestamp) {
  const query = `
    INSERT INTO event_logs (
      tx_hash,
      block_number,
      block_timestamp,
      log_index,
      address,
      topics,
      data
    )
    VALUES ($1, $2, to_timestamp($3), $4, $5, $6, $7)
    ON CONFLICT (tx_hash, log_index, block_timestamp) DO NOTHING;
  `;

  const values = [
    log.transactionHash,
    log.blockNumber,
    blockTimestamp,
    log.index,
    log.address,
    log.topics,
    log.data,
  ];

  await client.query(query, values);
}
