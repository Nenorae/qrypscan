import { ethers } from "ethers";
import { getTransactionsByAddress } from "../transactions/transaction.model.js";
import * as addressModel from "./address.model.js";
import { getContractByAddress } from "../contracts/contract.model.js"; // Import model kontrak
import config from "../../config/index.js";

// Cache status konektivitas node untuk mengurangi log yang berisik
const nodeStatus = {
  isOnline: true,
  lastCheck: 0,
  suppressUntil: 0, // Timestamp hingga kapan pesan log ditahan
};
const SUPPRESS_DURATION = 30000; // 30 detik

// Fungsi untuk mendapatkan provider dengan pengecekan konektivitas yang cerdas
async function getProvider() {
  const now = Date.now();

  // Jika kita sedang dalam periode menahan log, langsung kembalikan null
  if (now < nodeStatus.suppressUntil) {
    return null;
  }

  const provider = new ethers.JsonRpcProvider(config.node.rpcUrl);
  try {
    await provider.getNetwork();
    // Jika berhasil dan sebelumnya offline, tandai sebagai online
    if (!nodeStatus.isOnline) {
        console.log("[INFO] Node connection re-established.");
        nodeStatus.isOnline = true;
    }
    return provider;
  } catch (error) {
    // Jika koneksi gagal, catat pesan peringatan HANYA SEKALI
    if (nodeStatus.isOnline) {
        console.warn(`[WARN] Node is offline. Suppressing connection attempts for the next ${SUPPRESS_DURATION / 1000} seconds.`);
        nodeStatus.isOnline = false;
    }
    // Atur waktu penahanan log dan kembalikan null
    nodeStatus.suppressUntil = now + SUPPRESS_DURATION;
    return null;
  }
}

export const getDetailsForAddress = async (address) => {
  const normalizedAddress = address.toLowerCase().trim();
  if (!ethers.isAddress(normalizedAddress)) {
    throw new Error("Format alamat Ethereum tidak valid");
  }
  const checksumAddress = ethers.getAddress(normalizedAddress);

  // Cek database untuk verifikasi kontrak secara paralel
  const [transactions, provider, dbContract] = await Promise.all([
    getTransactionsByAddress(normalizedAddress),
    getProvider(),
    getContractByAddress(checksumAddress), // Cek database kita dulu
  ]);

  let balance = "0";
  // Sumber kebenaran utama untuk 'isContract' adalah database kita.
  let isContract = !!dbContract;

  if (provider) {
    try {
      const liveBalance = await provider.getBalance(checksumAddress);
      balance = liveBalance.toString();

      // Jika belum terdeteksi sebagai kontrak dari DB, cek live code sebagai fallback
      if (!isContract) {
        const code = await provider.getCode(checksumAddress);
        isContract = code !== '0x';
      }

    } catch (error) {
      console.warn(`[WARN] Failed to get balance or code for ${checksumAddress} even though node appears online: ${error.message}`);
    }
  }

  return {
    address: checksumAddress,
    balance: balance,
    transactions,
    isContract: isContract, // Sekarang nilai ini berdasarkan database
  };
};
