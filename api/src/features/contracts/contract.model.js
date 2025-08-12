// api/src/features/contracts/contract.model.js
import pool from "../../core/db.js";

/**
 * Mengambil data kontrak dari database secara cerdas.
 * - Mengambil data dasar dari tabel `contracts`.
 * - Jika kontrak adalah proxy, ia akan mengambil detail verifikasi (ABI, source code, dll.)
 *   dari alamat implementasinya di tabel `verified_contracts`.
 * - Jika bukan proxy, ia akan mengambil detail verifikasi dari alamatnya sendiri.
 * @param {string} address Alamat kontrak yang dicari.
 * @returns {Promise<object|null>} Objek kontrak yang digabungkan atau null jika tidak ditemukan.
 */
export async function getContractByAddress(address) {
  const client = await pool.connect();
  try {
    // Langkah 1: Ambil data dasar dan info proxy dari tabel `contracts`
    const contractQuery = `
      SELECT 
        address, 
        creator_address, 
        creation_tx_hash, 
        is_proxy, 
        proxy_type, 
        implementation_address, 
        admin_address
      FROM contracts
      WHERE address = $1;
    `;
    const contractRes = await client.query(contractQuery, [address]);
    if (contractRes.rows.length === 0) {
      console.log(`[DB Model] Kontrak ${address} tidak ditemukan di tabel 'contracts'.`);
      return null;
    }

    const contractData = contractRes.rows[0];
    
    // Langkah 2: Tentukan alamat mana yang akan digunakan untuk mencari data verifikasi.
    // Jika ini adalah proxy, gunakan alamat implementasi. Jika tidak, gunakan alamatnya sendiri.
    const targetAddressForVerification = contractData.is_proxy && contractData.implementation_address
      ? contractData.implementation_address
      : address;
    
    console.log(`[DB Model] Mencari detail verifikasi untuk alamat: ${targetAddressForVerification}`);

    // Langkah 3: Ambil detail verifikasi (jika ada) dari `verified_contracts` dan `contract_source_files`
    const verificationQuery = `
      SELECT
        vc.address as verified_address,
        vc.contract_name,
        vc.compiler_version,
        vc.is_verified,
        vc.verified_at,
        vc.abi,
        vc.optimization_used,
        vc.runs,
        vc.constructor_arguments,
        vc.evm_version,
        (
          SELECT json_agg(json_build_object('filePath', csf.file_path, 'sourceCode', csf.source_code))
          FROM contract_source_files csf
          WHERE csf.contract_address = vc.address
        ) as "sourceFiles"
      FROM verified_contracts vc
      WHERE vc.address = $1;
    `;
    const verificationRes = await client.query(verificationQuery, [targetAddressForVerification]);
    const verificationData = verificationRes.rows[0] || {};

    // Langkah 4: Gabungkan semua data menjadi satu objek respons
    const finalData = {
      // Data dasar dari tabel 'contracts'
      address: contractData.address,
      creator_address: contractData.creator_address,
      creation_tx_hash: contractData.creation_tx_hash,
      
      // Info proxy dari tabel 'contracts'
      is_proxy: contractData.is_proxy,
      proxy_type: contractData.proxy_type,
      implementation_address: contractData.implementation_address,
      admin_address: contractData.admin_address,

      // Detail verifikasi dari 'verified_contracts' (milik implementasi jika proxy)
      is_verified: !!verificationData.is_verified,
      contract_name: verificationData.contract_name,
      compiler_version: verificationData.compiler_version,
      abi: verificationData.abi,
      optimization_used: verificationData.optimization_used,
      runs: verificationData.runs,
      constructor_arguments: verificationData.constructor_arguments,
      evm_version: verificationData.evm_version,
      verified_at: verificationData.verified_at,
      sourceFiles: verificationData.sourceFiles || [],
    };

    console.log(`[DB Model] Data final yang digabungkan untuk ${address}:`, { ...finalData, abi: '...', sourceFiles: '...' });
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
 * Menetapkan alamat implementasi untuk kontrak proxy.
 * Ini dipanggil setelah verifikasi manual bahwa sebuah alamat adalah proxy.
 * @param {string} proxyAddress Alamat kontrak proxy.
 * @param {string} implementationAddress Alamat kontrak implementasi.
 * @returns {Promise<object|null>}
 */
export async function setImplementationAddress(proxyAddress, implementationAddress) {
  const client = await pool.connect();
  try {
    // Kita asumsikan 'proxy_type' adalah EIP-1967 karena service yang memanggil
    // fungsi ini secara spesifik memeriksa slot storage EIP-1967.
    const query = `
      UPDATE contracts
      SET 
        is_proxy = TRUE,
        implementation_address = $2,
        proxy_type = 'EIP-1967' -- Ditentukan oleh logika service
      WHERE address = $1
      RETURNING *;
    `;
    const res = await client.query(query, [proxyAddress, implementationAddress]);
    
    if (res.rows.length === 0) {
      // Ini bisa terjadi jika proxyAddress tidak ada di tabel 'contracts'.
      // Seharusnya, indexer sudah memasukkannya. Kita bisa memilih untuk melempar error
      // atau mencoba INSERT jika tidak ada. Untuk saat ini, kita log sebuah warning.
      console.warn(`[DB Model] Peringatan: Mencoba mengatur implementasi untuk proxy ${proxyAddress} yang tidak ada di DB.`);
      return null;
    }

    console.log(`[DB Model] Berhasil menautkan proxy ${proxyAddress} ke implementasi ${implementationAddress}.`);
    return res.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Mencari kontrak di tabel \`contracts\` (tabel umum untuk semua kontrak).
 * @param {string} address Alamat kontrak.
 * @returns {Promise<object|null>}
 */
export async function findContract(address) {
  const res = await pool.query("SELECT * FROM contracts WHERE address = $1", [address]);
  return res.rows[0] || null;
}

/**
 * Menyimpan data kontrak yang telah terverifikasi ke database dalam transaksi.
 * Pertama, simpan ke \`verified_contracts\`, lalu simpan semua \`sourceFiles\`.
 * @param {object} contractData
 * @param {Array<{filePath: string, sourceCode: string}>} sourceFiles
 * @returns {Promise<object>}
 */
export async function saveVerifiedContract(contractData, sourceFiles) {
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
