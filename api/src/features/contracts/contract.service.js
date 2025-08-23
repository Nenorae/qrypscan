import { ethers } from "ethers";
import config from "../../config/index.js";
import * as contractModel from "./contract.model.js";
import { verify as verifyContract } from "./verification.service.js";
import { handleHardhatVerification as hardhatVerify } from "./hardhat.handler.js";
import { detectProxyContract } from "../../../../indexer/src/processors/proxyDetection/index.js";
import logger from "../../core/logger.js";

const provider = new ethers.JsonRpcProvider(config.node.rpcUrl);

/**
 * Mengambil data kontrak dari database.
 * @param {string} address Alamat kontrak.
 * @returns {Promise<object|null>}
 */
export async function getContractByAddress(address) {
  logger.info("[contract.service.js] >> getContractByAddress");
  logger.info(`[API Service] Fetching contract data for address: ${address}`);
  const contractData = await contractModel.getContractByAddress(address);

  if (!contractData) {
    logger.warn(`[API Service] No contract data found for address: ${address}`);
    return null;
  }

  logger.info("[API Service] Raw data from model:", contractData);

  // Mapping snake_case dari DB ke camelCase untuk GraphQL
  const mappedData = {
    address: contractData.address,
    creatorAddress: contractData.creator_address,
    creationTxHash: contractData.creation_tx_hash,
    isVerified: contractData.is_verified,
    sourceFiles: contractData.sourceFiles,
    contractName: contractData.contract_name,
    compilerVersion: contractData.compiler_version,
    abi: contractData.abi,
    optimizationUsed: contractData.optimization_used,
    runs: contractData.runs,
    constructorArguments: contractData.constructor_arguments,
    evmVersion: contractData.evm_version,
    // Data proxy yang sudah disesuaikan
    isProxy: contractData.is_proxy, // Menggunakan flag langsung dari DB
    proxyType: contractData.proxy_type,
    implementationAddress: contractData.implementation_address,
    adminAddress: contractData.admin_address,
    blockNumber: contractData.block_number,
  };

  logger.info("[API Service] Mapped data for GraphQL:", mappedData);
  return mappedData;
}

/**
 * Mengambil semua kontrak dari database.
 * @returns {Promise<object[]>}
 */
export async function getContracts() {
  logger.info("[contract.service.js] >> getContracts");
  logger.info(`[API Service] Fetching all contracts`);
  const contracts = await contractModel.getContracts();
  return contracts.map((contractData) => ({
    address: contractData.address,
    creatorAddress: contractData.creator_address,
    creationTxHash: contractData.creation_tx_hash,
    isVerified: contractData.is_verified,
    sourceFiles: [], // Tidak perlu mengirim source files di list view
    contractName: contractData.contract_name,
    compilerVersion: contractData.compiler_version,
    abi: null, // Tidak perlu mengirim ABI di list view
    optimizationUsed: contractData.optimization_used,
    runs: contractData.runs,
    constructorArguments: contractData.constructor_arguments,
    evmVersion: contractData.evm_version,
    isProxy: !!contractData.implementation_address,
    implementationAddress: contractData.implementation_address,
    blockNumber: contractData.block_number,
  }));
}

/**
 * Mengambil riwayat upgrade untuk sebuah kontrak proxy.
 * @param {string} address Alamat proxy.
 * @returns {Promise<object[]>}
 */
export async function getProxyUpgradeHistory(address) {
  logger.info("[contract.service.js] >> getProxyUpgradeHistory");
  logger.info(`[API Service] Fetching proxy upgrade history for address: ${address}`);
  const history = await contractModel.getProxyUpgradeHistory(address);

  // Map snake_case from DB to camelCase for GraphQL
  return history.map((record) => ({
    implementationAddress: record.implementation_address,
    proxyType: record.proxy_type,
    txHash: record.tx_hash,
    blockNumber: record.block_number,
    blockTimestamp: record.block_timestamp.toISOString(), // Pastikan formatnya string ISO
  }));
}

/**
 * Memverifikasi apakah sebuah kontrak adalah proxy yang valid dan menunjuk
 * ke alamat implementasi yang sudah terverifikasi, menggunakan detektor proxy tingkat lanjut.
 * @param {object} input
 * @param {string} input.proxyAddress
 * @param {string} input.implementationAddress
 * @returns {Promise<{success: boolean, message: string, contract: object|null}>}
 */
export async function verifyProxy({ proxyAddress, implementationAddress }) {
  logger.info("[contract.service.js] >> verifyProxy");
  logger.info(`[API Service][verifyProxy] 🕵️ Memulai verifikasi proxy (versi Lanjutan) untuk ${proxyAddress} -> ${implementationAddress}`);

  try {
    // 1. Pastikan alamat implementasi yang diberikan sudah terverifikasi
    logger.info(`[API Service][verifyProxy] [1/4] 🔍 Mengecek status verifikasi untuk alamat implementasi: ${implementationAddress}`);
    const implementationContract = await contractModel.getContractByAddress(implementationAddress);
    if (!implementationContract || !implementationContract.is_verified) {
      logger.warn(`[API Service][verifyProxy] ❌ GAGAL: Kontrak implementasi ${implementationAddress} belum terverifikasi.`);
      return { success: false, message: "Implementation contract is not verified." };
    }
    logger.info(`[API Service][verifyProxy] ✅ OK: Kontrak implementasi terverifikasi.`);

    // 2. Gunakan detektor proxy dari indexer untuk menganalisis proxy
    logger.info(`[API Service][verifyProxy] [2/4] 🔬 Menjalankan deteksi proxy tingkat lanjut untuk ${proxyAddress}...`);
    const detectionResult = await detectProxyContract(proxyAddress, provider);
    logger.info(`[API Service][verifyProxy]   - Hasil Deteksi:`, detectionResult);

    if (!detectionResult.isProxy || !detectionResult.implementation) {
      return { success: false, message: `Failed to detect proxy details or implementation for ${proxyAddress}.` };
    }

    // 3. Bandingkan implementasi yang terdeteksi dengan yang diberikan pengguna
    logger.info(`[API Service][verifyProxy] [3/4] 🔄 Membandingkan alamat implementasi...`);
    logger.info(`   - Terdeteksi: ${detectionResult.implementation}`);
    logger.info(`   - Diberikan:  ${implementationAddress}`);
    if (detectionResult.implementation.toLowerCase() !== implementationAddress.toLowerCase()) {
      const message = `Proxy at ${proxyAddress} points to a different implementation (${detectionResult.implementation}) than the one provided (${implementationAddress}).`;
      logger.warn(`[API Service][verifyProxy] ❌ GAGAL: ${message}`);
      return { success: false, message };
    }
    logger.info(`[API Service][verifyProxy] ✅ OK: Alamat implementasi cocok.`);

    // 4. Jika valid, simpan detail proxy yang terdeteksi ke database
    logger.info(`[API Service][verifyProxy] [4/4] 💾 Menyimpan detail proxy yang terdeteksi ke database...`);
    await contractModel.setProxyDetails(proxyAddress, {
      implementationAddress: detectionResult.implementation,
      proxyType: detectionResult.proxyType,
      adminAddress: detectionResult.admin,
    });
    logger.info(`[API Service] Successfully verified and saved proxy relationship.`);

    // 5. Ambil data gabungan yang baru untuk dikembalikan
    logger.info(`[API Service][verifyProxy] 🔄 Mengambil data kontrak yang sudah diperbarui untuk ${proxyAddress}`);
    const updatedContractData = await getContractByAddress(proxyAddress);

    logger.info(`[API Service][verifyProxy] 🎉 Verifikasi proxy BERHASIL.`);
    return {
      success: true,
      message: "Proxy successfully verified and linked with detailed detection.",
      contract: updatedContractData,
    };
  } catch (error) {
    logger.error("[API Service] Error during advanced proxy verification:", error);
    return { success: false, message: `An error occurred: ${error.message}` };
  }
}

/**
 * Menautkan alamat proxy ke alamat implementasi.
 * Fungsi ini dipanggil oleh Hardhat handler.
 * @param {object} input
 * @param {string} input.proxyAddress
 * @param {string} input.implementationAddress
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function linkProxyContract({ proxyAddress, implementationAddress }) {
  logger.info("[contract.service.js] >> linkProxyContract");
  logger.info(`[API Service][linkProxyContract] 🔗 Menautkan proxy ${proxyAddress} ke implementasi ${implementationAddress}`);

  // Reuse the logic from verifyProxy, but maybe with a slightly different return value
  // for the Hardhat context if needed. For now, let's keep it simple.
  logger.info(`[API Service][linkProxyContract] 📞 Memanggil verifyProxy...`);
  const result = await verifyProxy({ proxyAddress, implementationAddress });
  logger.info(`[API Service][linkProxyContract] ✅ Hasil dari verifyProxy:`, result);

  // The handler only needs success and message.
  return {
    success: result.success,
    message: result.message,
  };
}

// Ekspor fungsi verifikasi untuk digunakan oleh resolver GraphQL
export const verify = verifyContract;

// Ekspor handler Hardhat untuk digunakan oleh rute Express
export const handleHardhatVerification = hardhatVerify;