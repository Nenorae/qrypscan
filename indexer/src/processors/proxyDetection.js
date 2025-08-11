import { ethers } from "ethers";

// =============================================================================
// KONSTANTA SLOT PENYIMPANAN STANDAR
// =============================================================================

// EIP-1967 Standard Proxy Storage Slots
const EIP1967_SLOTS = {
  IMPLEMENTATION: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  ADMIN: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  BEACON: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
};

// OpenZeppelin Legacy Slots (pre EIP-1967)
const LEGACY_SLOTS = {
  OZ_IMPLEMENTATION: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
  OZ_ADMIN: "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b",
};

// Compound Proxy Patterns
const COMPOUND_SLOTS = {
  IMPLEMENTATION: "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7",
};

// =============================================================================
// POLA BYTECODE UNTUK BERBAGAI JENIS PROXY
// =============================================================================

const PROXY_PATTERNS = {
  // EIP-1167 Minimal Proxy (Clone Factory)
  EIP1167: {
    pattern: /^0x363d3d373d3d3d363d73([a-fA-F0-9]{40})5af43d82803e903d91602b57fd5bf3$/,
    name: "EIP-1167 Minimal Proxy",
  },

  // EIP-1967 Transparent Proxy patterns
  TRANSPARENT_PROXY: {
    // Delegatecall pattern with fallback
    pattern:
      /6080604052348015600f57600080fd5b50600436106100365760003560e01c80635c60da1b146100365780638f28397014610036575b6100627f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5490565b6040516001600160a01b03909116906000818403908183f09050801561008657005b600080fd5b/,
    name: "EIP-1967 Transparent Proxy",
  },

  // UUPS Proxy pattern
  UUPS_PROXY: {
    pattern:
      /608060405236156100105760006100166100bb565b9050610018565b005b6000357c0100000000000000000000000000000000000000000000000000000000900480636352211e146100bb578063095ea7b31461010757806342842e0e1461015357806370a082311461019f575b60006100c56100bb565b905090565b60007f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc54905090/,
    name: "UUPS Upgradeable Proxy",
  },

  // Beacon Proxy pattern
  BEACON_PROXY: {
    pattern:
      /608060405234801561001057600080fd5b50600080546001600160a01b031916735fbdb2315678afecb367f032d93f642f64180aa31790556101e4806100476000396000f3fe608060405236156100235760003560e01c80635c60da1b1461007c575b61002b610082565b005b60006100796100b4565b90505b90565b6100896100b4565b6040516001600160a01b03909116906000818403908183f09050801561008057005b600080fd5b60007fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d5054905090/,
    name: "Beacon Proxy",
  },
};

// =============================================================================
// FUNGSI UTILITAS
// =============================================================================

/**
 * Mengkonversi hex storage value menjadi alamat
 * @param {string} storageValue - Nilai hex dari storage
 * @returns {string|null} - Alamat yang valid atau null jika invalid
 */
function extractAddressFromStorage(storageValue) {
  if (!storageValue || storageValue === "0x" + "0".repeat(64)) {
    return null;
  }

  try {
    // Alamat berada di 20 byte terakhir (40 karakter hex terakhir)
    const addressHex = "0x" + storageValue.slice(-40);
    return ethers.getAddress(addressHex);
  } catch {
    return null;
  }
}

/**
 * Memeriksa apakah bytecode mengandung pola delegatecall
 * @param {string} bytecode - Bytecode kontrak
 * @returns {boolean} - True jika mengandung delegatecall
 */
function containsDelegateCall(bytecode) {
  // Opcode untuk DELEGATECALL adalah 0xf4
  return bytecode.includes("f4");
}

/**
 * Memeriksa apakah address adalah zero address
 * @param {string} address - Alamat untuk diperiksa
 * @returns {boolean} - True jika zero address
 */
function isZeroAddress(address) {
  return !address || address === "0x" + "0".repeat(40);
}

// =============================================================================
// FUNGSI DETEKSI PROXY UTAMA
// =============================================================================

/**
 * Mendeteksi proxy contract dengan analisis komprehensif
 * @param {string} contractAddress - Alamat kontrak
 * @param {ethers.Provider} provider - Provider ethers
 * @param {object} options - Opsi deteksi
 * @returns {Promise<object>} - Hasil deteksi proxy
 */
export async function detectProxyContract(contractAddress, provider, options = {}) {
  const { checkLegacySlots = true, checkBytecodePatterns = true, checkBeaconProxy = true, timeout = 10000, retries = 2 } = options;

  if (!ethers.isAddress(contractAddress)) {
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
    const implementationResult = await withTimeout(checkEIP1967ImplementationSlot(contractAddress, provider), timeout);

    if (implementationResult.found) {
      Object.assign(result, implementationResult);
      result.details.push("EIP-1967 implementation slot detected");
    }

    // 2. Cek EIP-1967 Admin Slot
    const adminResult = await withTimeout(checkEIP1967AdminSlot(contractAddress, provider), timeout);

    if (adminResult.found) {
      result.admin = adminResult.admin;
      result.details.push("EIP-1967 admin slot detected");
      if (!result.isProxy) {
        result.isProxy = true;
        result.proxyType = "eip1967-admin-only";
        result.confidence = "medium";
      }
    }

    // 3. Cek Beacon Proxy jika diminta
    if (checkBeaconProxy) {
      const beaconResult = await withTimeout(checkEIP1967BeaconSlot(contractAddress, provider), timeout);

      if (beaconResult.found) {
        result.beacon = beaconResult.beacon;
        result.details.push("EIP-1967 beacon slot detected");

        // Cek implementation dari beacon
        const beaconImpl = await withTimeout(getBeaconImplementation(beaconResult.beacon, provider), timeout);

        if (beaconImpl) {
          result.implementation = beaconImpl;
          result.isProxy = true;
          result.proxyType = "beacon";
          result.confidence = "high";
          result.details.push("Beacon implementation resolved");
        }
      }
    }

    // 4. Cek Legacy Slots jika diminta
    if (checkLegacySlots) {
      const legacyResult = await withTimeout(checkLegacySlots(contractAddress, provider), timeout);

      if (legacyResult.found) {
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
      const bytecodeResult = await withTimeout(analyzeBytecodePatterns(contractAddress, provider), timeout);

      if (bytecodeResult.found) {
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
      const implValidation = await withTimeout(validateImplementation(result.implementation, provider), timeout);

      if (!implValidation.valid) {
        result.warnings.push(`Implementation validation: ${implValidation.reason}`);
        if (result.confidence === "high") {
          result.confidence = "medium";
        }
      } else {
        result.details.push("Implementation address validated");
      }
    }

    // 7. Deteksi UUPS Pattern
    if (result.isProxy && result.implementation) {
      const uupsCheck = await withTimeout(checkUUPSPattern(result.implementation, provider), timeout);

      if (uupsCheck.isUUPS) {
        result.proxyType = result.proxyType === "eip1967" ? "uups" : result.proxyType;
        result.details.push("UUPS upgrade pattern detected");
      }
    }
  } catch (error) {
    result.warnings.push(`Detection error: ${error.message}`);

    // Fallback: coba deteksi sederhana
    try {
      const fallbackResult = await basicProxyDetection(contractAddress, provider);
      if (fallbackResult.isProxy) {
        Object.assign(result, fallbackResult);
        result.details.push("Fallback detection used");
        result.warnings.push("Primary detection failed, using fallback");
      }
    } catch (fallbackError) {
      result.warnings.push(`Fallback detection failed: ${fallbackError.message}`);
    }
  }

  return result;
}

// =============================================================================
// FUNGSI DETEKSI SPESIFIK
// =============================================================================

/**
 * Memeriksa EIP-1967 implementation slot
 */
async function checkEIP1967ImplementationSlot(contractAddress, provider) {
  try {
    const storageValue = await provider.getStorage(contractAddress, EIP1967_SLOTS.IMPLEMENTATION);
    const implementation = extractAddressFromStorage(storageValue);

    if (implementation && !isZeroAddress(implementation)) {
      return {
        found: true,
        isProxy: true,
        proxyType: "eip1967",
        implementation,
        confidence: "high",
      };
    }
  } catch (error) {
    throw new Error(`Failed to check implementation slot: ${error.message}`);
  }

  return { found: false };
}

/**
 * Memeriksa EIP-1967 admin slot
 */
async function checkEIP1967AdminSlot(contractAddress, provider) {
  try {
    const storageValue = await provider.getStorage(contractAddress, EIP1967_SLOTS.ADMIN);
    const admin = extractAddressFromStorage(storageValue);

    if (admin && !isZeroAddress(admin)) {
      return { found: true, admin };
    }
  } catch (error) {
    throw new Error(`Failed to check admin slot: ${error.message}`);
  }

  return { found: false };
}

/**
 * Memeriksa EIP-1967 beacon slot
 */
async function checkEIP1967BeaconSlot(contractAddress, provider) {
  try {
    const storageValue = await provider.getStorage(contractAddress, EIP1967_SLOTS.BEACON);
    const beacon = extractAddressFromStorage(storageValue);

    if (beacon && !isZeroAddress(beacon)) {
      return { found: true, beacon };
    }
  } catch (error) {
    throw new Error(`Failed to check beacon slot: ${error.message}`);
  }

  return { found: false };
}

/**
 * Mendapatkan implementation dari beacon contract
 */
async function getBeaconImplementation(beaconAddress, provider) {
  try {
    // Beacon contract harus memiliki function implementation() -> address
    const beaconInterface = new ethers.Interface(["function implementation() view returns (address)"]);

    const data = beaconInterface.encodeFunctionData("implementation");
    const result = await provider.call({
      to: beaconAddress,
      data: data,
    });

    const decodedResult = beaconInterface.decodeFunctionResult("implementation", result);
    return decodedResult[0];
  } catch (error) {
    return null;
  }
}

/**
 * Memeriksa legacy proxy slots
 */
async function checkLegacySlots(contractAddress, provider) {
  const slots = [LEGACY_SLOTS.OZ_IMPLEMENTATION, COMPOUND_SLOTS.IMPLEMENTATION];

  for (const slot of slots) {
    try {
      const storageValue = await provider.getStorage(contractAddress, slot);
      const implementation = extractAddressFromStorage(storageValue);

      if (implementation && !isZeroAddress(implementation)) {
        return {
          found: true,
          isProxy: true,
          proxyType: "legacy",
          implementation,
          confidence: "medium",
        };
      }
    } catch (error) {
      continue;
    }
  }

  return { found: false };
}

/**
 * Analisis pola bytecode
 */
async function analyzeBytecodePatterns(contractAddress, provider) {
  try {
    const bytecode = await provider.getCode(contractAddress);

    if (!bytecode || bytecode === "0x") {
      return { found: false };
    }

    // Cek setiap pola
    for (const [key, pattern] of Object.entries(PROXY_PATTERNS)) {
      const match = bytecode.match(pattern.pattern);

      if (match) {
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
        }

        return result;
      }
    }

    // Cek pola delegatecall umum
    if (containsDelegateCall(bytecode)) {
      return {
        found: true,
        isProxy: true,
        proxyType: "generic",
        patternName: "Generic Delegatecall Pattern",
        confidence: "low",
      };
    }
  } catch (error) {
    throw new Error(`Failed to analyze bytecode: ${error.message}`);
  }

  return { found: false };
}

/**
 * Validasi implementation address
 */
async function validateImplementation(implementationAddress, provider) {
  try {
    if (isZeroAddress(implementationAddress)) {
      return { valid: false, reason: "Zero address" };
    }

    const code = await provider.getCode(implementationAddress);
    if (!code || code === "0x") {
      return { valid: false, reason: "No code at implementation address" };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

/**
 * Memeriksa UUPS pattern
 */
async function checkUUPSPattern(implementationAddress, provider) {
  try {
    // UUPS implementation harus memiliki function proxiableUUID() -> bytes32
    const uupsInterface = new ethers.Interface(["function proxiableUUID() view returns (bytes32)"]);

    const data = uupsInterface.encodeFunctionData("proxiableUUID");
    const result = await provider.call({
      to: implementationAddress,
      data: data,
    });

    const decodedResult = uupsInterface.decodeFunctionResult("proxiableUUID", result);
    const uuid = decodedResult[0];

    // UUID harus sama dengan EIP-1967 implementation slot
    return {
      isUUPS: uuid === EIP1967_SLOTS.IMPLEMENTATION,
      uuid,
    };
  } catch (error) {
    return { isUUPS: false };
  }
}

/**
 * Deteksi proxy dasar sebagai fallback
 */
async function basicProxyDetection(contractAddress, provider) {
  try {
    const bytecode = await provider.getCode(contractAddress);

    if (!bytecode || bytecode === "0x") {
      return { found: false };
    }

    // Cek keberadaan DELEGATECALL
    if (containsDelegateCall(bytecode)) {
      return {
        isProxy: true,
        proxyType: "unknown",
        confidence: "low",
      };
    }

    return { found: false };
  } catch (error) {
    return { found: false };
  }
}

// =============================================================================
// FUNGSI UTILITAS TAMBAHAN
// =============================================================================

/**
 * Mendapatkan informasi lengkap tentang proxy
 * @param {string} contractAddress - Alamat proxy contract
 * @param {ethers.Provider} provider - Provider ethers
 * @returns {Promise<object>} - Informasi lengkap proxy
 */
export async function getProxyInfo(contractAddress, provider) {
  const detection = await detectProxyContract(contractAddress, provider);

  if (!detection.isProxy) {
    return detection;
  }

  // Tambahan informasi jika proxy terdeteksi
  const info = { ...detection };

  try {
    // Cek owner/admin jika ada
    if (info.admin) {
      info.adminInfo = await getAddressInfo(info.admin, provider);
    }

    // Cek implementation jika ada
    if (info.implementation) {
      info.implementationInfo = await getAddressInfo(info.implementation, provider);
    }

    // Cek beacon jika ada
    if (info.beacon) {
      info.beaconInfo = await getAddressInfo(info.beacon, provider);
    }
  } catch (error) {
    info.warnings = info.warnings || [];
    info.warnings.push(`Failed to get additional info: ${error.message}`);
  }

  return info;
}

/**
 * Mendapatkan informasi dasar tentang address
 */
async function getAddressInfo(address, provider) {
  try {
    const [code, balance] = await Promise.all([provider.getCode(address), provider.getBalance(address)]);

    return {
      address,
      hasCode: code && code !== "0x",
      codeSize: code ? (code.length - 2) / 2 : 0,
      balance: ethers.formatEther(balance),
    };
  } catch (error) {
    return {
      address,
      error: error.message,
    };
  }
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

  // Process in batches to avoid overwhelming the provider
  for (let i = 0; i < addresses.length; i += concurrency) {
    const batch = addresses.slice(i, i + concurrency);
    const batchPromises = batch.map(async (address) => {
      try {
        return await detectProxyContract(address, provider, options);
      } catch (error) {
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

  return results;
}
