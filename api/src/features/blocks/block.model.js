// src/features/blocks/block.model.js
import db from "../../core/db.js"; // Asumsi koneksi DB ada di core

export const getBlockByNumber = async (number) => {
  const { rows } = await db.query("SELECT * FROM blocks WHERE block_number = $1", [number]);
  return rows[0];
};

export const getLatestBlocks = async (limit) => {
  const { rows } = await db.query("SELECT * FROM blocks ORDER BY block_number DESC LIMIT $1", [limit]);
  return rows;
};

export const getBlocksPaginated = async (page, limit) => {
  const offset = (page - 1) * limit;
  const { rows } = await db.query("SELECT * FROM blocks ORDER BY block_number DESC LIMIT $1 OFFSET $2", [limit, offset]);
  return rows;
};

export const getTotalBlockCount = async () => {
  const { rows } = await db.query("SELECT COUNT(*) FROM blocks");
  return parseInt(rows[0].count, 10);
};
