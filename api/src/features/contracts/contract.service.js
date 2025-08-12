// api/src/features/contracts/contract.service.js
import { ethers } from "ethers";
import config from "../../config/index.js";
import * as contractModel from "./contract.model.js";
import { verify as verifyContract } from "./verification.service.js";
import { handleHardhatVerification as hardhatVerify } from "./hardhat.handler.js";

const provider = new ethers.JsonRpcProvider(config.node.rpcUrl);

/**
 * Mengambil data kontrak dari database.
 * @param {string} address Alamat kontrak.
 * @returns {Promise<object|null>}
 */
export async function getContractByAddress(address) {
  console.log(`[API Service] Fetching contract data for address: ${address}`);
  const contractData = await contractModel.getContractByAddress(address);
  
  if (!contractData) {
    console.log(`[API Service] No contract data found for address: ${address}`);
    return null;
  }

  console.log('[API Service] Raw data from model:', contractData);

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
  };

  console.log('[API Service] Mapped data for GraphQL:', mappedData);
  return mappedData;
}

/**
 * Mengambil semua kontrak dari database.
 * @returns {Promise<object[]>}
 */
export async function getContracts() {
  console.log(`[API Service] Fetching all contracts`);
  const contracts = await contractModel.getContracts();
  return contracts.map(contractData => ({
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
  }));
}

/**
 * Mengambil riwayat upgrade untuk sebuah kontrak proxy.
 * @param {string} address Alamat proxy.
 * @returns {Promise<object[]>}
 */
export async function getProxyUpgradeHistory(address) {
  console.log(`[API Service] Fetching proxy upgrade history for address: ${address}`);
  const history = await contractModel.getProxyUpgradeHistory(address);
  
  // Map snake_case from DB to camelCase for GraphQL
  return history.map(record => ({
    implementationAddress: record.implementation_address,
    proxyType: record.proxy_type,
    txHash: record.tx_hash,
    blockNumber: record.block_number,
    blockTimestamp: record.block_timestamp.toISOString(), // Pastikan formatnya string ISO
  }));
}

/**
 * Memverifikasi apakah sebuah kontrak adalah proxy yang valid dan menunjuk
 * ke alamat implementasi yang sudah terverifikasi.
 * @param {object} input
 * @param {string} input.proxyAddress
 * @param {string} input.implementationAddress
 * @returns {Promise<{success: boolean, message: string, contract: object|null}>}
 */
export async function verifyProxy({ proxyAddress, implementationAddress }) {
  console.log(`[API Service] Starting proxy verification for ${proxyAddress} -> ${implementationAddress}`);

  try {
    // 1. Pastikan alamat implementasi sudah terverifikasi
    const implementationContract = await contractModel.getContractByAddress(implementationAddress);
    if (!implementationContract || !implementationContract.is_verified) {
      return { success: false, message: "Implementation contract is not verified." };
    }

    // 2. Baca storage slot EIP-1967 untuk mendapatkan alamat implementasi on-chain
    const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    const storageValue = await provider.getStorage(proxyAddress, implementationSlot);
    const onChainImplementationAddress = ethers.getAddress(ethers.dataSlice(storageValue, 12)); // Alamat adalah 20 byte terakhir

    console.log(`[API Service] On-chain implementation address: ${onChainImplementationAddress}`);

    // 3. Bandingkan alamat on-chain dengan yang diberikan
    if (onChainImplementationAddress.toLowerCase() !== implementationAddress.toLowerCase()) {
      return {
        success: false,
        message: `Proxy at ${proxyAddress} points to ${onChainImplementationAddress}, not the provided implementation ${implementationAddress}.`,
      };
    }

    // 4. Jika valid, simpan hubungan di database
    await contractModel.setImplementationAddress(proxyAddress, implementationAddress, {
      contract_name: implementationContract.contract_name,
      compiler_version: implementationContract.compiler_version,
    });
    console.log(`[API Service] Successfully verified and saved proxy relationship.`);

    // 5. Ambil data gabungan yang baru untuk dikembalikan
    const updatedContractData = await getContractByAddress(proxyAddress);

    return {
      success: true,
      message: "Proxy successfully verified and linked.",
      contract: updatedContractData,
    };
  } catch (error) {
    console.error("[API Service] Error during proxy verification:", error);
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
  console.log(`[API Service] Linking proxy ${proxyAddress} to implementation ${implementationAddress}`);
  
  // Reuse the logic from verifyProxy, but maybe with a slightly different return value
  // for the Hardhat context if needed. For now, let's keep it simple.
  const result = await verifyProxy({ proxyAddress, implementationAddress });
  
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
