import pool from "../../core/db.js";

/**
 * Memeriksa apakah suatu alamat adalah kontrak berdasarkan data di database.
 * Ini akan memeriksa tabel `verified_contracts` dan `tokens`.
 * @param {string} address Alamat yang akan diperiksa.
 * @returns {Promise<boolean>} True jika alamat adalah kontrak, false jika tidak.
 */
export async function getContractStatusByAddress(address) {
  // Periksa di tabel verified_contracts
  const verifiedContractRes = await pool.query(
    "SELECT 1 FROM verified_contracts WHERE address = $1",
    [address]
  );
  if (verifiedContractRes.rows.length > 0) {
    return true; // Ditemukan di verified_contracts
  }

  // Periksa di tabel tokens (untuk kontrak yang belum diverifikasi tapi sudah di-index)
  const tokenRes = await pool.query(
    "SELECT 1 FROM tokens WHERE contract_address = $1",
    [address]
  );
  if (tokenRes.rows.length > 0) {
    return true; // Ditemukan di tokens
  }

  return false; // Tidak ditemukan di kedua tabel
}