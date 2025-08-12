import { ethers } from "ethers";
import { EIP1967_SLOTS, LEGACY_SLOTS, COMPOUND_SLOTS, PROXY_PATTERNS } from "./constants.js";
import { extractAddressFromStorage, isZeroAddress, containsDelegateCall } from "./utils.js";

/**
 * Memeriksa EIP-1967 implementation slot
 */
export async function checkEIP1967ImplementationSlot(contractAddress, provider) {
  try {
    const storageValue = await provider.getStorage(contractAddress, EIP1967_SLOTS.IMPLEMENTATION);
    const implementation = extractAddressFromStorage(storageValue);

    if (implementation && !isZeroAddress(implementation)) {
      console.log(`[PROXY-DEBUG] Ditemukan implementasi di slot EIP-1967 untuk ${contractAddress}: ${implementation}`);
      return {
        found: true,
        isProxy: true,
        proxyType: "eip1967",
        implementation,
        confidence: "high",
      };
    }
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal memeriksa slot implementasi untuk ${contractAddress}: ${error.message}`);
    throw new Error(`Failed to check implementation slot: ${error.message}`);
  }

  return { found: false };
}

/**
 * Memeriksa EIP-1967 admin slot
 */
export async function checkEIP1967AdminSlot(contractAddress, provider) {
  try {
    const storageValue = await provider.getStorage(contractAddress, EIP1967_SLOTS.ADMIN);
    const admin = extractAddressFromStorage(storageValue);

    if (admin && !isZeroAddress(admin)) {
      console.log(`[PROXY-DEBUG] Ditemukan admin di slot EIP-1967 untuk ${contractAddress}: ${admin}`);
      return { found: true, admin };
    }
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal memeriksa slot admin untuk ${contractAddress}: ${error.message}`);
    throw new Error(`Failed to check admin slot: ${error.message}`);
  }

  return { found: false };
}

/**
 * Memeriksa EIP-1967 beacon slot
 */
export async function checkEIP1967BeaconSlot(contractAddress, provider) {
  try {
    const storageValue = await provider.getStorage(contractAddress, EIP1967_SLOTS.BEACON);
    const beacon = extractAddressFromStorage(storageValue);

    if (beacon && !isZeroAddress(beacon)) {
      console.log(`[PROXY-DEBUG] Ditemukan beacon di slot EIP-1967 untuk ${contractAddress}: ${beacon}`);
      return { found: true, beacon };
    }
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal memeriksa slot beacon untuk ${contractAddress}: ${error.message}`);
    throw new Error(`Failed to check beacon slot: ${error.message}`);
  }

  return { found: false };
}

/**
 * Mendapatkan implementation dari beacon contract
 */
export async function getBeaconImplementation(beaconAddress, provider) {
  try {
    console.log(`[PROXY-DEBUG] Memanggil fungsi implementation() pada beacon ${beaconAddress}`);
    // Beacon contract harus memiliki function implementation() -> address
    const beaconInterface = new ethers.Interface(["function implementation() view returns (address)"]);

    const data = beaconInterface.encodeFunctionData("implementation");
    const result = await provider.call({
      to: beaconAddress,
      data: data,
    });

    const decodedResult = beaconInterface.decodeFunctionResult("implementation", result);
    console.log(`[PROXY-DEBUG] Implementasi dari beacon ${beaconAddress} adalah ${decodedResult[0]}`);
    return decodedResult[0];
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal mendapatkan implementasi dari beacon ${beaconAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Memeriksa legacy proxy slots
 */
export async function checkLegacySlots(contractAddress, provider) {
  const slots = [LEGACY_SLOTS.OZ_IMPLEMENTATION, COMPOUND_SLOTS.IMPLEMENTATION];

  for (const slot of slots) {
    try {
      const storageValue = await provider.getStorage(contractAddress, slot);
      const implementation = extractAddressFromStorage(storageValue);

      if (implementation && !isZeroAddress(implementation)) {
        console.log(`[PROXY-DEBUG] Ditemukan implementasi di slot legacy ${slot} untuk ${contractAddress}: ${implementation}`);
        return {
          found: true,
          isProxy: true,
          proxyType: "legacy",
          implementation,
          confidence: "medium",
        };
      }
    } catch (error) {
      console.warn(`[PROXY-WARN] Gagal memeriksa slot legacy ${slot} untuk ${contractAddress}: ${error.message}`);
      continue;
    }
  }

  return { found: false };
}

/**
 * Analisis pola bytecode
 */
export async function analyzeBytecodePatterns(contractAddress, provider) {
  try {
    const bytecode = await provider.getCode(contractAddress);

    if (!bytecode || bytecode === "0x") {
      console.log(`[PROXY-DEBUG] Tidak ada bytecode untuk ${contractAddress}`);
      return { found: false };
    }

    // Cek setiap pola
    for (const [key, pattern] of Object.entries(PROXY_PATTERNS)) {
      const match = bytecode.match(pattern.pattern);

      if (match) {
        console.log(`[PROXY-DEBUG] Bytecode untuk ${contractAddress} cocok dengan pola ${pattern.name}`);
        const result = {
          found: true,
          isProxy: true,
          proxyType: key.toLowerCase(),
          patternName: pattern.name,
          confidence: "high",
        };

        // Extract implementation jika ada
        if (match[1]) {
          result.implementation = ethers.getAddress(`0x${match[1]}`);
          console.log(`[PROXY-DEBUG] Implementasi diekstrak dari bytecode: ${result.implementation}`);
        }

        return result;
      }
    }

    // Cek pola delegatecall umum
    if (containsDelegateCall(bytecode)) {
      console.log(`[PROXY-DEBUG] Bytecode untuk ${contractAddress} mengandung DELEGATECALL umum`);
      return {
        found: true,
        isProxy: true,
        proxyType: "generic",
        patternName: "Generic Delegatecall Pattern",
        confidence: "low",
      };
    }
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal menganalisis bytecode untuk ${contractAddress}: ${error.message}`);
    throw new Error(`Failed to analyze bytecode: ${error.message}`);
  }

  return { found: false };
}

/**
 * Validasi implementation address
 */
export async function validateImplementation(implementationAddress, provider) {
  try {
    if (isZeroAddress(implementationAddress)) {
      console.warn(`[PROXY-WARN] Alamat implementasi adalah zero address.`);
      return { valid: false, reason: "Zero address" };
    }

    const code = await provider.getCode(implementationAddress);
    if (!code || code === "0x") {
      console.warn(`[PROXY-WARN] Tidak ada kode di alamat implementasi ${implementationAddress}`);
      return { valid: false, reason: "No code at implementation address" };
    }

    return { valid: true };
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal memvalidasi implementasi ${implementationAddress}: ${error.message}`);
    return { valid: false, reason: error.message };
  }
}

/**
 * Memeriksa UUPS pattern
 */
export async function checkUUPSPattern(implementationAddress, provider) {
  try {
    console.log(`[PROXY-DEBUG] Memeriksa proxiableUUID() pada implementasi ${implementationAddress}`);
    // UUPS implementation harus memiliki function proxiableUUID() -> bytes32
    const uupsInterface = new ethers.Interface(["function proxiableUUID() view returns (bytes32)"]);

    const data = uupsInterface.encodeFunctionData("proxiableUUID");
    const result = await provider.call({
      to: implementationAddress,
      data: data,
    });

    const decodedResult = uupsInterface.decodeFunctionResult("proxiableUUID", result);
    const uuid = decodedResult[0];
    console.log(`[PROXY-DEBUG] UUID yang ditemukan: ${uuid}`);

    // UUID harus sama dengan EIP-1967 implementation slot
    const isUUPS = uuid === EIP1967_SLOTS.IMPLEMENTATION;
    console.log(`[PROXY-DEBUG] Apakah ini UUPS? ${isUUPS}`);
    return {
      isUUPS,
      uuid,
    };
  } catch (error) {
    console.log(`[PROXY-DEBUG] Gagal memeriksa pola UUPS untuk ${implementationAddress} (kemungkinan bukan UUPS): ${error.message}`);
    return { isUUPS: false };
  }
}

/**
 * Deteksi proxy dasar sebagai fallback
 */
export async function basicProxyDetection(contractAddress, provider) {
  try {
    const bytecode = await provider.getCode(contractAddress);

    if (!bytecode || bytecode === "0x") {
      return { found: false };
    }

    // Cek keberadaan DELEGATECALL
    if (containsDelegateCall(bytecode)) {
      console.log(`[PROXY-DEBUG] Deteksi fallback: Ditemukan DELEGATECALL di ${contractAddress}`);
      return {
        isProxy: true,
        proxyType: "unknown",
        confidence: "low",
      };
    }

    return { found: false };
  } catch (error) {
    console.error(`[PROXY-ERROR] Gagal saat deteksi fallback untuk ${contractAddress}: ${error.message}`);
    return { found: false };
  }
}
