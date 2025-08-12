import { ethers } from "ethers";

/**
 * Mengkonversi hex storage value menjadi alamat
 * @param {string} storageValue - Nilai hex dari storage
 * @returns {string|null} - Alamat yang valid atau null jika invalid
 */
export function extractAddressFromStorage(storageValue) {
  if (!storageValue || storageValue === "0x" + "0".repeat(64)) {
    return null;
  }

  try {
    // Alamat berada di 20 byte terakhir (40 karakter hex terakhir)
    const addressHex = "0x" + storageValue.slice(-40);
    return ethers.getAddress(addressHex);
  } catch (e) {
    console.error(`[PROXY-DEBUG] Gagal mengekstrak alamat dari nilai storage: ${storageValue}`, e);
    return null;
  }
}

/**
 * Memeriksa apakah bytecode mengandung pola delegatecall
 * @param {string} bytecode - Bytecode kontrak
 * @returns {boolean} - True jika mengandung delegatecall
 */
export function containsDelegateCall(bytecode) {
  // Opcode untuk DELEGATECALL adalah 0xf4
  return bytecode.includes("f4");
}

/**
 * Memeriksa apakah address adalah zero address
 * @param {string} address - Alamat untuk diperiksa
 * @returns {boolean} - True jika zero address
 */
export function isZeroAddress(address) {
  return !address || address === "0x" + "0".repeat(40);
}

/**
 * Mendapatkan informasi dasar tentang address
 */
export async function getAddressInfo(address, provider) {
  try {
    console.log(`[PROXY-DEBUG] Mendapatkan info untuk alamat: ${address}`);
    const [code, balance] = await Promise.all([provider.getCode(address), provider.getBalance(address)]);

    const addressInfo = {
      address,
      hasCode: code && code !== "0x",
      codeSize: code ? (code.length - 2) / 2 : 0,
      balance: ethers.formatEther(balance),
    };
    console.log(`[PROXY-DEBUG] Info untuk ${address}:`, addressInfo);
    return addressInfo;
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal mendapatkan info untuk alamat ${address}: ${error.message}`);
    return {
      address,
      error: error.message,
    };
  }
}
