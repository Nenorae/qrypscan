import { ethers } from "ethers";
import config from "../../config/index.js";
import { debugUtils } from "./verification.utils.js";
import { compareBytecode as compare, analyzeBytecode } from "./bytecode.utils.js";

const provider = new ethers.JsonRpcProvider(config.node.rpcUrl);

export async function getDeployedBytecode(address) {
  debugUtils.logInfo("[verification.bytecode.js] >> getDeployedBytecode");
  debugUtils.logStep(1, 6, `Mengambil bytecode dari blockchain untuk alamat: ${address}`);
  try {
    debugUtils.logInfo(`Connecting to RPC: ${config.node.rpcUrl}`);
    const deployedBytecode = await provider.getCode(address);
    
    debugUtils.logDebug("Raw bytecode response", {
      length: deployedBytecode?.length || 0,
      isEmpty: deployedBytecode === "0x",
      preview: deployedBytecode?.slice(0, 50) + "..." || "kosong",
    });

    if (deployedBytecode === "0x" || !deployedBytecode) {
      debugUtils.logError("Tidak ada bytecode ditemukan pada alamat tersebut");
      return {
        success: false,
        message: "Alamat yang diberikan bukan merupakan kontrak atau tidak memiliki bytecode.",
      };
    }

    debugUtils.logSuccess(`Deployed bytecode berhasil diambil (${deployedBytecode.length} karakter)`);
    analyzeBytecode(deployedBytecode.slice(2), "DEPLOYED");
    return { success: true, bytecode: deployedBytecode };

  } catch (error) {
    debugUtils.logError("Gagal mengambil bytecode dari blockchain", error);
    return {
      success: false,
      message: `Gagal mengambil bytecode: ${error.message}`,
    };
  }
}

export function compareBytecodes(deployedBytecode, runtimeBytecode) {
  debugUtils.logInfo("[verification.bytecode.js] >> compareBytecodes");
  debugUtils.logStep(5, 6, "Membandingkan bytecode deployed vs compiled");

  debugUtils.logInfo("Menganalisis bytecode yang di-deploy...");
  analyzeBytecode(deployedBytecode.slice(2), "DEPLOYED ON-CHAIN");

  debugUtils.logInfo("Menganalisis bytecode hasil kompilasi...");
  analyzeBytecode(runtimeBytecode.slice(2), "COMPILED");

  try {
    const comparisonResult = compare(deployedBytecode, runtimeBytecode);
    debugUtils.logDebug("Hasil perbandingan bytecode mentah", comparisonResult);

    const { isIdentical } = comparisonResult;
    
    if (isIdentical) {
        debugUtils.logSuccess("✅✅✅ Bytecode COCOK! Kontrak terverifikasi. ✅✅✅");
        return { success: true, isIdentical: true };
    } else {
        debugUtils.logError("❌❌❌ Bytecode TIDAK COCOK - Verifikasi gagal ❌❌❌");
        // Detail sudah di-log oleh `compare` dari `bytecode.utils.js`
        return {
            success: true, // Proses perbandingan berhasil, hasilnya tidak cocok
            isIdentical: false,
            message: "Bytecode tidak cocok. Pastikan kode sumber, versi compiler, dan pengaturan optimisasi sudah benar.",
            debugInfo: {
                deployedBytecodeLength: deployedBytecode.length,
                compiledBytecodeLength: runtimeBytecode.length,
                cleanedDeployedLength: comparisonResult.cleanedDeployed.length,
                cleanedRuntimeLength: comparisonResult.cleanedRuntime.length,
            }
        };
    }
  } catch (error) {
    debugUtils.logError("Error saat membandingkan bytecode", error);
    return {
      success: false,
      message: `Error dalam perbandingan bytecode: ${error.message}`,
    };
  }
}