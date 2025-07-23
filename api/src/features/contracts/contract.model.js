// api/src/features/contracts/contract.model.js
import pool from "../../core/db.js";

/**
 * Mengambil data kontrak dari database. Jika kontrak adalah proxy, data
 * verifikasi (seperti ABI dan source code) akan diambil dari kontrak implementasi.
 * @param {string} address Alamat kontrak.
 * @returns {Promise<object|null>}
 */
export async function getContractByAddress(address) {
  const client = await pool.connect();
  try {
    // Langkah 1 & 2: Ambil data dasar & cek apakah ini proxy
    const initialQuery = `
      SELECT 
        c.address, c.creator_address, c.creation_tx_hash,
        vc.implementation_address
      FROM contracts c
      LEFT JOIN verified_contracts vc ON c.address = vc.address
      WHERE c.address = $1;
    `;
    const initialRes = await client.query(initialQuery, [address]);
    if (initialRes.rows.length === 0) return null;

    const baseData = initialRes.rows[0];
    const implementationAddress = baseData.implementation_address;
    const isProxy = !!implementationAddress;

    // Langkah 3: Jika bukan proxy, ambil detail verifikasinya sendiri
    if (!isProxy) {
      const verificationQuery = `
        SELECT *, (SELECT json_agg(json_build_object('filePath', file_path, 'sourceCode', source_code)) FROM contract_source_files WHERE contract_address = $1) as "sourceFiles"
        FROM verified_contracts 
        WHERE address = $1;
      `;
      const verificationRes = await client.query(verificationQuery, [address]);
      const verificationData = verificationRes.rows[0] || {};
      
      return {
        ...baseData,
        ...verificationData,
        is_verified: !!verificationData.address,
        isProxy: false,
        sourceFiles: verificationData.sourceFiles || [],
      };
    }

    // Langkah 4: Jika INI ADALAH PROXY, ambil detail dari implementasi
    console.log(`[DB Model] Proxy terdeteksi: ${address} -> ${implementationAddress}. Mengambil detail dari implementasi.`);
    const implementationQuery = `
      SELECT *, (SELECT json_agg(json_build_object('filePath', file_path, 'sourceCode', source_code)) FROM contract_source_files WHERE contract_address = $1) as "sourceFiles"
      FROM verified_contracts 
      WHERE address = $1;
    `;
    const implementationRes = await client.query(implementationQuery, [implementationAddress]);
    const implementationData = implementationRes.rows[0] || {};

    // Langkah 5: Gabungkan hasil
    const finalData = {
      // Data dari proxy
      address: baseData.address,
      creator_address: baseData.creator_address,
      creation_tx_hash: baseData.creation_tx_hash,
      
      // Flag khusus proxy
      isProxy: true,
      implementation_address: implementationAddress,

      // Data dari implementasi (menimpa jika ada)
      is_verified: !!implementationData.address, // Dianggap terverifikasi jika implementasi ada di tabel
      contract_name: implementationData.contract_name,
      compiler_version: implementationData.compiler_version,
      abi: implementationData.abi,
      optimization_used: implementationData.optimization_used,
      runs: implementationData.runs,
      constructor_arguments: implementationData.constructor_arguments,
      evm_version: implementationData.evm_version,
      verified_at: implementationData.verified_at,
      sourceFiles: implementationData.sourceFiles || [],
    };

    return finalData;

  } finally {
    client.release();
  }
}

/**
 * Mengambil semua kontrak dari database.
 * @returns {Promise<object[]>}
 */
export async function getContracts() {
  const query = `
    SELECT
      c.address,
      c.creator_address,
      c.creation_tx_hash,
      vc.is_verified,
      vc.contract_name,
      vc.compiler_version,
      vc.optimization_used,
      vc.runs,
      vc.constructor_arguments,
      vc.evm_version,
      vc.implementation_address
    FROM contracts c
    LEFT JOIN verified_contracts vc ON c.address = vc.address
    ORDER BY c.block_number DESC;
  `;
  const res = await pool.query(query);
  return res.rows;
}

/**
 * Menyimpan alamat implementasi untuk sebuah kontrak proxy.
 * @param {string} proxyAddress Alamat kontrak proxy.
 * @param {string} implementationAddress Alamat kontrak implementasi.
 * @returns {Promise<void>}
 */
export async function setImplementationAddress(proxyAddress, implementationAddress, details) {
  const { contract_name, compiler_version } = details;
  const query = `
    INSERT INTO verified_contracts (address, implementation_address, contract_name, compiler_version, is_verified, verified_at)
    VALUES ($1, $2, $3, $4, FALSE, CURRENT_TIMESTAMP)
    ON CONFLICT (address) DO UPDATE
    SET implementation_address = $2,
        -- Hanya perbarui nama & versi jika sebelumnya null (opsional, tapi aman)
        contract_name = COALESCE(verified_contracts.contract_name, $3),
        compiler_version = COALESCE(verified_contracts.compiler_version, $4),
        updated_at = CURRENT_TIMESTAMP;
  `;
  await pool.query(query, [proxyAddress, implementationAddress, contract_name, compiler_version]);
  console.log(`[DB Model] Set/updated implementation for ${proxyAddress} to ${implementationAddress}`);
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