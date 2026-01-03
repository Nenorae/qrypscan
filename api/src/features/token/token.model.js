// api/src/features/token/token.model.js
import db from "../../core/db.js";
import logger from "../../core/logger.js";

/**
 * Mengambil informasi dasar token dari database berdasarkan alamat kontrak.
 * @param {string} contractAddress Alamat kontrak token.
 * @returns {Promise<object|null>} Objek token jika ditemukan, null jika tidak.
 */
export async function getTokenInfoByAddress(contractAddress) {
  logger.info(`[token.model.js] >> getTokenInfoByAddress: ${contractAddress}`);
  try {
    const query = `
      SELECT
        contract_address,
        name,
        symbol,
        decimals,
        token_type
      FROM tokens
      WHERE contract_address = LOWER($1);
    `;
    const { rows } = await db.query(query, [contractAddress]);

    if (rows.length === 0) {
      logger.warn(`[token.model.js] Token dengan alamat ${contractAddress} tidak ditemukan.`);
      return null;
    }

    // Mengembalikan data dalam format camelCase jika diperlukan di layer atas
    return {
      contractAddress: rows[0].contract_address,
      name: rows[0].name,
      symbol: rows[0].symbol,
      decimals: rows[0].decimals,
      tokenType: rows[0].token_type,
    };
  } catch (error) {
    logger.error(`[token.model.js] Gagal mengambil info token untuk ${contractAddress}:`, error);
    throw error;
  }
}
