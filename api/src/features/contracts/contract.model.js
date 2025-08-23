// api/src/features/contracts/contract.model.js
import pool from "../../core/db.js";

import logger from "../../core/logger.js";

/**
 * Mengambil data kontrak dari database secara cerdas.
 * - Mengambil data dasar dari tabel `contracts`.
 * - Jika kontrak adalah proxy, ia akan mengambil detail verifikasi (ABI, source code, dll.)
 *   dari alamat implementasinya di tabel `verified_contracts`.
 * - Jika bukan proxy, ia akan mengambil detail verifikasi dari alamatnya sendiri.
 * @param {string} address Alamat kontrak yang dicari.
 * @returns {Promise<object|null>}
 */
export async function getContractByAddress(address) {
  logger.info("[contract.model.js] >> getContractByAddress");
  const client = await pool.connect();
  try {
    const query = `
      -- Query ini menggunakan UNION ALL untuk secara eksplisit menangani dua kasus terpisah:
      -- 1. Kontrak ada di tabel 'contracts' (dan mungkin juga 'verified_contracts').
      -- 2. Kontrak HANYA ada di tabel 'verified_contracts' (misalnya, diverifikasi sebelum diindeks).
      -- Pendekatan ini memastikan bahwa jika sebuah kontrak ada di salah satu tabel, itu akan ditemukan.

      -- Kasus 1: Kontrak ada di 'contracts'. Ini adalah jalur utama dan paling umum.
      SELECT
          LOWER(c.address) as query_address,
          c.address as contract_address,
          c.creator_address,
          c.creation_tx_hash,
          c.block_number,
          c.is_proxy,
          c.proxy_type,
          c.implementation_address,
          c.admin_address,
          vc.address as verified_contract_address,
          vc.is_verified,
          vc.contract_name,
          vc.compiler_version,
          vc.abi,
          vc.optimization_used,
          vc.runs,
          vc.constructor_arguments,
          vc.evm_version,
          vc.verified_at,
          (
            SELECT json_agg(json_build_object('filePath', csf.file_path, 'sourceCode', csf.source_code))
            FROM contract_source_files csf
            WHERE LOWER(csf.contract_address) = LOWER(vc.address)
          ) as "sourceFiles"
      FROM contracts c
      LEFT JOIN verified_contracts vc ON LOWER(vc.address) = LOWER(
          CASE
              WHEN c.is_proxy AND c.implementation_address IS NOT NULL THEN c.implementation_address
              ELSE c.address
          END
      )
      WHERE LOWER(c.address) = LOWER($1)

      UNION ALL

      -- Kasus 2: Kontrak HANYA ada di 'verified_contracts' dan belum ada di 'contracts'.
      SELECT
          LOWER(vc.address) as query_address,
          NULL as contract_address,
          NULL as creator_address,
          NULL as creation_tx_hash,
          NULL as block_number,
          FALSE as is_proxy, -- Kita tidak tahu status proxy jika tidak ada di 'contracts'
          NULL as proxy_type,
          NULL as implementation_address,
          NULL as admin_address,
          vc.address as verified_contract_address,
          vc.is_verified,
          vc.contract_name,
          vc.compiler_version,
          vc.abi,
          vc.optimization_used,
          vc.runs,
          vc.constructor_arguments,
          vc.evm_version,
          vc.verified_at,
          (
            SELECT json_agg(json_build_object('filePath', csf.file_path, 'sourceCode', csf.source_code))
            FROM contract_source_files csf
            WHERE LOWER(csf.contract_address) = LOWER(vc.address)
          ) as "sourceFiles"
      FROM verified_contracts vc
      WHERE LOWER(vc.address) = LOWER($1) AND NOT EXISTS (SELECT 1 FROM contracts c WHERE LOWER(c.address) = LOWER($1));
    `;
    const res = await client.query(query, [address]);

    if (res.rows.length === 0) {
      logger.warn(`[DB Model] Kontrak ${address} tidak ditemukan.`);
      return null;
    }

    const contractData = res.rows[0];

    // Memastikan nilai default yang benar untuk data yang mungkin null
    const finalData = {
      ...contractData,
      is_verified: !!contractData.is_verified,
      sourceFiles: contractData.sourceFiles || [],
      // Pastikan abi adalah null jika tidak ada, bukan string kosong atau lainnya
      abi: contractData.abi || null, 
    };
    
    logger.info(`[DB Model] Data final yang digabungkan untuk ${address}:`, { ...finalData, abi: '...', sourceFiles: '...' });
    return finalData;

  } finally {
    client.release();
  }
}

/**
 * Mengambil daftar kontrak untuk ditampilkan di halaman utama.
 * Menggabungkan data dari `contracts` dan `verified_contracts`.
 * @returns {Promise<object[]>}
 */
export async function getContracts() {
  logger.info("[contract.model.js] >> getContracts");
  const query = `
    SELECT
      c.address,
      c.creator_address,
      c.creation_tx_hash,
      c.block_number,
      c.is_proxy,
      c.proxy_type,
      -- Ambil nama dari implementasi jika proxy dan terverifikasi, jika tidak dari verifikasi diri sendiri
      COALESCE(vc_impl.contract_name, vc_self.contract_name) as contract_name,
      -- Status verifikasi didasarkan pada apakah implementasi (jika proxy) atau diri sendiri terverifikasi
      (CASE 
        WHEN c.is_proxy THEN vc_impl.is_verified 
        ELSE vc_self.is_verified 
      END) as is_verified
    FROM contracts c
    LEFT JOIN verified_contracts vc_self ON c.address = vc_self.address AND NOT c.is_proxy
    LEFT JOIN verified_contracts vc_impl ON c.implementation_address = vc_impl.address AND c.is_proxy
    ORDER BY c.block_number DESC;
  `;
  const res = await pool.query(query);
  return res.rows;
}


/**
 * Menetapkan atau memperbarui detail proxy untuk sebuah kontrak.
 * Ini dipanggil setelah verifikasi manual atau deteksi otomatis.
 * @param {string} proxyAddress Alamat kontrak proxy.
 * @param {object} details Detail proxy yang akan diatur.
 * @param {string} details.implementationAddress Alamat implementasi.
 * @param {string} details.proxyType Tipe proxy (e.g., 'uups', 'eip1967', 'beacon').
 * @param {string} [details.adminAddress] Alamat admin (opsional).
 * @returns {Promise<object|null>}
 */
export async function setProxyDetails(proxyAddress, { implementationAddress, proxyType, adminAddress }) {
  logger.info("[contract.model.js] >> setProxyDetails");
  const client = await pool.connect();
  try {
    logger.info(`[DB Model][setProxyDetails] Executing UPDATE on 'contracts' table for ${proxyAddress}.`, { implementationAddress, proxyType, adminAddress });

    const query = `
      UPDATE contracts
      SET 
        is_proxy = TRUE,
        implementation_address = $2,
        proxy_type = $3,
        admin_address = $4
      WHERE address = $1
      RETURNING *;
    `;
    const values = [proxyAddress, implementationAddress, proxyType, adminAddress || null];
    const res = await client.query(query, values);
    
    if (res.rows.length === 0) {
      logger.warn(`[DB Model] Peringatan: Mencoba mengatur detail proxy untuk ${proxyAddress} yang tidak ada di DB.`);
      return null;
    }

    logger.info(`[DB Model] Berhasil memperbarui detail proxy untuk ${proxyAddress}.`);
    return res.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Mencari kontrak di tabel `contracts` (tabel umum untuk semua kontrak).
 * @param {string} address Alamat kontrak.
 * @returns {Promise<object|null>}
 */
export async function findContract(address) {
  logger.info("[contract.model.js] >> findContract");
  const res = await pool.query("SELECT * FROM contracts WHERE address = $1", [address]);
  return res.rows[0] || null;
}

/**
 * Menyimpan data kontrak yang telah terverifikasi ke database dalam transaksi.
 * Pertama, simpan ke `verified_contracts`, lalu simpan semua `sourceFiles`.
 * @param {object} contractData
 * @param {Array<{filePath: string, sourceCode: string}>} sourceFiles
 * @returns {Promise<object>}
 */
export async function saveVerifiedContract(contractData, sourceFiles) {
  logger.info("[contract.model.js] >> saveVerifiedContract");
  const {
    address,
    contractName,
    compilerVersion,
    abi,
    optimizationUsed,
    runs,
    constructorArguments,
    evmVersion,
  } = contractData;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const verifiedContractQuery = `
      INSERT INTO verified_contracts 
        (address, contract_name, compiler_version, abi, optimization_used, runs, constructor_arguments, evm_version, is_verified, verified_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, CURRENT_TIMESTAMP)
      ON CONFLICT (address) DO UPDATE
      SET contract_name = $2,
          compiler_version = $3,
          abi = $4,
          optimization_used = $5,
          runs = $6,
          constructor_arguments = $7,
          evm_version = $8,
          is_verified = TRUE,
          verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    
    const verifiedContractValues = [
      address,
      contractName,
      compilerVersion,
      abi,
      optimizationUsed === '1',
      parseInt(runs) || null,
      constructorArguments || null,
      evmVersion || 'default'
    ];

    const res = await client.query(verifiedContractQuery, verifiedContractValues);
    const dbRow = res.rows[0];

    // Hapus source file lama sebelum memasukkan yang baru untuk memastikan konsistensi
    await client.query('DELETE FROM contract_source_files WHERE contract_address = $1', [address]);

    // Masukkan semua source file
    const sourceFileInsertQuery = `
      INSERT INTO contract_source_files (contract_address, file_path, source_code)
      VALUES ($1, $2, $3);
    `;
    for (const file of sourceFiles) {
      await client.query(sourceFileInsertQuery, [address, file.filePath, file.sourceCode]);
    }

    await client.query("COMMIT");

    // Mengembalikan data yang sudah diformat
    return {
      address: dbRow.address,
      isVerified: dbRow.is_verified,
      sourceFiles, // Kembalikan source files yang baru disimpan
      contractName: dbRow.contract_name,
      compilerVersion: dbRow.compiler_version,
      abi: dbRow.abi,
      optimizationUsed: dbRow.optimization_used,
      runs: dbRow.runs,
      constructorArguments: dbRow.constructor_arguments,
      evmVersion: dbRow.evm_version,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Mengambil riwayat upgrade untuk sebuah kontrak proxy dari tabel `proxy_upgrades`.
 * @param {string} address Alamat kontrak proxy.
 * @returns {Promise<object[]>} Array dari event upgrade.
 */
export async function getProxyUpgradeHistory(address) {
  logger.info("[contract.model.js] >> getProxyUpgradeHistory");
  const query = `
    SELECT 
      implementation_address,
      proxy_type,
      tx_hash,
      block_number,
      block_timestamp
    FROM proxy_upgrades
    WHERE proxy_address = $1
    ORDER BY block_number DESC, block_timestamp DESC;
  `;
  const res = await pool.query(query, [address]);
  return res.rows;
}