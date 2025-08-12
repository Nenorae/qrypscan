import { ethers } from "ethers";
import { getAddressInfo } from "./utils.js";
import {
  checkEIP1967ImplementationSlot,
  checkEIP1967AdminSlot,
  checkEIP1967BeaconSlot,
  getBeaconImplementation,
  checkLegacySlots,
  analyzeBytecodePatterns,
  validateImplementation,
  checkUUPSPattern,
  basicProxyDetection,
} from "./detectionChecks.js";
import { ProxyEventHandler } from "./ProxyEventHandler.js";

/**
 * Mendeteksi proxy contract dengan analisis komprehensif
 * @param {string} contractAddress - Alamat kontrak
 * @param {ethers.Provider} provider - Provider ethers
 * @param {object} options - Opsi deteksi
 * @returns {Promise<object>} - Hasil deteksi proxy
 */
export async function detectProxyContract(contractAddress, provider, options = {}) {
  const { shouldCheckLegacySlots: checkLegacy = true, checkBytecodePatterns = true, checkBeaconProxy = true, timeout = 10000, retries = 2 } = options;
  console.log(`[PROXY-DEBUG] Memulai deteksi proxy untuk ${contractAddress} dengan opsi:`, options);

  if (!ethers.isAddress(contractAddress)) {
    console.error(`[PROXY-ERROR] Alamat kontrak tidak valid: ${contractAddress}`);
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }

  const result = {
    isProxy: false,
    proxyType: null,
    implementation: null,
    admin: null,
    beacon: null,
    confidence: "none",
    details: [],
    warnings: [],
  };

  try {
    // Timeout wrapper untuk semua operasi
    const withTimeout = (promise, ms) => {
      return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Operation timeout")), ms))]);
    };

    // 1. Cek EIP-1967 Implementation Slot
    console.log(`[PROXY-DEBUG] 1. Memeriksa slot implementasi EIP-1967 untuk ${contractAddress}`);
    const implementationResult = await withTimeout(checkEIP1967ImplementationSlot(contractAddress, provider), timeout);

    if (implementationResult.found) {
      Object.assign(result, implementationResult);
      result.details.push("EIP-1967 implementation slot detected");
      console.log(`[PROXY-DEBUG] Ditemukan implementasi EIP-1967: ${implementationResult.implementation}`);
    }

    // 2. Cek EIP-1967 Admin Slot
    console.log(`[PROXY-DEBUG] 2. Memeriksa slot admin EIP-1967 untuk ${contractAddress}`);
    const adminResult = await withTimeout(checkEIP1967AdminSlot(contractAddress, provider), timeout);

    if (adminResult.found) {
      result.admin = adminResult.admin;
      result.details.push("EIP-1967 admin slot detected");
      console.log(`[PROXY-DEBUG] Ditemukan admin EIP-1967: ${adminResult.admin}`);
      if (!result.isProxy) {
        result.isProxy = true;
        result.proxyType = "eip1967-admin-only";
        result.confidence = "medium";
      }
    }

    // 3. Cek Beacon Proxy jika diminta
    if (checkBeaconProxy) {
      console.log(`[PROXY-DEBUG] 3. Memeriksa slot beacon EIP-1967 untuk ${contractAddress}`);
      const beaconResult = await withTimeout(checkEIP1967BeaconSlot(contractAddress, provider), timeout);

      if (beaconResult.found) {
        result.beacon = beaconResult.beacon;
        result.details.push("EIP-1967 beacon slot detected");
        console.log(`[PROXY-DEBUG] Ditemukan beacon EIP-1967: ${beaconResult.beacon}`);

        // Cek implementation dari beacon
        console.log(`[PROXY-DEBUG] Mengambil implementasi dari beacon ${beaconResult.beacon}`);
        const beaconImpl = await withTimeout(getBeaconImplementation(beaconResult.beacon, provider), timeout);

        if (beaconImpl) {
          result.implementation = beaconImpl;
          result.isProxy = true;
          result.proxyType = "beacon";
          result.confidence = "high";
          result.details.push("Beacon implementation resolved");
          console.log(`[PROXY-DEBUG] Implementasi beacon ditemukan: ${beaconImpl}`);
        }
      }
    }

    // 4. Cek Legacy Slots jika diminta
    if (checkLegacy) {
      console.log(`[PROXY-DEBUG] 4. Memeriksa slot proxy legacy untuk ${contractAddress}`);
      const legacyResult = await withTimeout(checkLegacySlots(contractAddress, provider), timeout);

      if (legacyResult.found) {
        console.log(`[PROXY-DEBUG] Ditemukan implementasi proxy legacy: ${legacyResult.implementation}`);
        if (!result.isProxy) {
          Object.assign(result, legacyResult);
          result.details.push("Legacy proxy slots detected");
        } else {
          result.details.push("Legacy slots also present");
        }
      }
    }

    // 5. Analisis Bytecode jika diminta
    if (checkBytecodePatterns) {
      console.log(`[PROXY-DEBUG] 5. Menganalisis pola bytecode untuk ${contractAddress}`);
      const bytecodeResult = await withTimeout(analyzeBytecodePatterns(contractAddress, provider), timeout);

      if (bytecodeResult.found) {
        console.log(`[PROXY-DEBUG] Ditemukan pola bytecode: ${bytecodeResult.patternName}`);
        if (!result.isProxy) {
          Object.assign(result, bytecodeResult);
          result.details.push(`Bytecode pattern: ${bytecodeResult.patternName}`);
        } else {
          result.details.push(`Bytecode confirms: ${bytecodeResult.patternName}`);
          // Update confidence jika bytecode mendukung temuan storage
          if (result.confidence === "medium") {
            result.confidence = "high";
          }
        }
      }
    }

    // 6. Validasi Implementation Address
    if (result.implementation) {
      console.log(`[PROXY-DEBUG] 6. Memvalidasi alamat implementasi: ${result.implementation}`);
      const implValidation = await withTimeout(validateImplementation(result.implementation, provider), timeout);

      if (!implValidation.valid) {
        result.warnings.push(`Implementation validation: ${implValidation.reason}`);
        console.warn(`[PROXY-WARN] Validasi implementasi gagal untuk ${result.implementation}: ${implValidation.reason}`);
        if (result.confidence === "high") {
          result.confidence = "medium";
        }
      } else {
        result.details.push("Implementation address validated");
        console.log(`[PROXY-DEBUG] Alamat implementasi ${result.implementation} tervalidasi.`);
      }
    }

    // 7. Deteksi UUPS Pattern
    if (result.isProxy && result.implementation) {
      console.log(`[PROXY-DEBUG] 7. Memeriksa pola UUPS pada implementasi ${result.implementation}`);
      const uupsCheck = await withTimeout(checkUUPSPattern(result.implementation, provider), timeout);

      if (uupsCheck.isUUPS) {
        result.proxyType = result.proxyType === "eip1967" ? "uups" : result.proxyType;
        result.details.push("UUPS upgrade pattern detected");
        console.log(`[PROXY-DEBUG] Pola UUPS terdeteksi.`);
      }
    }
  } catch (error) {
    console.error(`[PROXY-ERROR] Terjadi kesalahan saat deteksi proxy untuk ${contractAddress}: ${error.message}`);
    result.warnings.push(`Detection error: ${error.message}`);

    // Fallback: coba deteksi sederhana
    try {
      console.log(`[PROXY-DEBUG] Menjalankan deteksi fallback untuk ${contractAddress}`);
      const fallbackResult = await basicProxyDetection(contractAddress, provider);
      if (fallbackResult.isProxy) {
        Object.assign(result, fallbackResult);
        result.details.push("Fallback detection used");
        result.warnings.push("Primary detection failed, using fallback");
        console.log(`[PROXY-DEBUG] Deteksi fallback berhasil.`);
      }
    } catch (fallbackError) {
      console.error(`[PROXY-ERROR] Deteksi fallback gagal untuk ${contractAddress}: ${fallbackError.message}`);
      result.warnings.push(`Fallback detection failed: ${fallbackError.message}`);
    }
  }

  console.log(`[PROXY-DEBUG] Hasil akhir deteksi untuk ${contractAddress}:`, result);
  return result;
}

/**
 * Mendapatkan informasi lengkap tentang proxy
 * @param {string} contractAddress - Alamat proxy contract
 * @param {ethers.Provider} provider - Provider ethers
 * @returns {Promise<object>} - Informasi lengkap proxy
 */
export async function getProxyInfo(contractAddress, provider) {
  console.log(`[PROXY-DEBUG] Mendapatkan info proxy lengkap untuk ${contractAddress}`);
  const detection = await detectProxyContract(contractAddress, provider);

  if (!detection.isProxy) {
    console.log(`[PROXY-DEBUG] ${contractAddress} bukan proxy.`);
    return detection;
  }

  // Tambahan informasi jika proxy terdeteksi
  const info = { ...detection };

  try {
    // Cek owner/admin jika ada
    if (info.admin) {
      console.log(`[PROXY-DEBUG] Mendapatkan info untuk admin: ${info.admin}`);
      info.adminInfo = await getAddressInfo(info.admin, provider);
    }

    // Cek implementation jika ada
    if (info.implementation) {
      console.log(`[PROXY-DEBUG] Mendapatkan info untuk implementasi: ${info.implementation}`);
      info.implementationInfo = await getAddressInfo(info.implementation, provider);
    }

    // Cek beacon jika ada
    if (info.beacon) {
      console.log(`[PROXY-DEBUG] Mendapatkan info untuk beacon: ${info.beacon}`);
      info.beaconInfo = await getAddressInfo(info.beacon, provider);
    }
  } catch (error) {
    info.warnings = info.warnings || [];
    info.warnings.push(`Failed to get additional info: ${error.message}`);
    console.error(`[PROXY-ERROR] Gagal mendapatkan info tambahan untuk ${contractAddress}: ${error.message}`);
  }

  console.log(`[PROXY-DEBUG] Info proxy lengkap untuk ${contractAddress}:`, info);
  return info;
}

/**
 * Batch detection untuk multiple contracts
 * @param {string[]} addresses - Array alamat kontrak
 * @param {ethers.Provider} provider - Provider ethers
 * @param {object} options - Opsi deteksi
 * @returns {Promise<object[]>} - Array hasil deteksi
 */
export async function batchDetectProxy(addresses, provider, options = {}) {
  const { concurrency = 5 } = options;
  const results = [];
  console.log(`[PROXY-DEBUG] Memulai deteksi batch untuk ${addresses.length} alamat dengan konkurensi ${concurrency}`);

  // Process in batches to avoid overwhelming the provider
  for (let i = 0; i < addresses.length; i += concurrency) {
    const batch = addresses.slice(i, i + concurrency);
    console.log(`[PROXY-DEBUG] Memproses batch ${i / concurrency + 1}: ${batch.join(", ")}`);
    const batchPromises = batch.map(async (address) => {
      try {
        return await detectProxyContract(address, provider, options);
      } catch (error) {
        console.error(`[PROXY-ERROR] Deteksi batch gagal untuk ${address}: ${error.message}`);
        return {
          isProxy: false,
          error: error.message,
          address,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  console.log(`[PROXY-DEBUG] Deteksi batch selesai. Total hasil: ${results.length}`);
  return results;
}

export { ProxyEventHandler };
