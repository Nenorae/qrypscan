// File: api/src/features/logs/log.service.js (Perbaikan)

import pool from "../../core/db.js";
import { ethers } from "ethers";
import logger from "../../core/logger.js";

export async function getLogs(params) {
  const { address, fromBlock, toBlock, topic0 } = params;

  let query = `
    SELECT 
      tx_hash AS "transactionHash",
      block_number AS "blockNumber",
      log_index AS "logIndex",
      address,
      topics,
      data
    FROM event_logs 
    WHERE address = $1
  `;
  const values = [address];
  let valueCounter = 2;

  if (fromBlock && fromBlock !== "latest") {
    const fromBlockNum = parseInt(String(fromBlock), 10);
    if (!isNaN(fromBlockNum)) {
      query += ` AND block_number >= $${valueCounter}`; // DIperbaiki di sini
      values.push(fromBlockNum);
      valueCounter++;
    }
  }

  if (toBlock && toBlock !== "latest") {
    const toBlockNum = parseInt(String(toBlock), 10);
    if (!isNaN(toBlockNum)) {
      query += ` AND block_number <= $${valueCounter}`; // Diperbaiki di sini
      values.push(toBlockNum);
      valueCounter++;
    }
  }

  if (topic0) {
    query += ` AND topics[1] = $${valueCounter}`; // Diperbaiki di sini
    values.push(topic0);
    valueCounter++;
  }

  query += " ORDER BY block_number ASC, log_index ASC;";

  try {
    const { rows } = await pool.query(query, values);

    const formattedRows = rows.map((row) => ({
      ...row,
      blockNumber: ethers.toBeHex(row.blockNumber),
      logIndex: ethers.toBeHex(row.logIndex),
      removed: false,
    }));

    return {
      status: "1",
      message: "OK",
      result: formattedRows,
    };
  } catch (error) {
    logger.error("Error fetching logs from DB:", error);
    return {
      status: "0",
      message: "Error fetching logs from database",
      result: [],
    };
  }
}
