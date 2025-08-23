import { ethers } from "ethers";
import { debugUtils } from "./verification.utils.js";

export function validateAndDefault(input) {
    debugUtils.logInfo("[verification.validator.js] >> validateAndDefault");
    debugUtils.logStep(0, 6, "Memulai Proses Verifikasi Kontrak");
    debugUtils.logDebug("Input yang diterima", {
      hasAddress: !!input.address,
      hasSourceCode: !!input.sourceCode,
      sourceCodeType: typeof input.sourceCode,
      sourceCodeLength: input.sourceCode?.length || 0,
      contractName: input.contractName,
      compilerVersion: input.compilerVersion,
      optimizationUsed: input.optimizationUsed,
      runs: input.runs,
      hasConstructorArgs: !!input.constructorArguments,
      constructorArgsLength: input.constructorArguments?.length || 0,
      evmVersion: input.evmVersion,
    });

    let { address, sourceCode: sourceCodePayload, contractName: fullContractName, compilerVersion, optimizationUsed, runs, constructorArguments, evmVersion } = input;

    if (optimizationUsed === undefined) {
      optimizationUsed = false;
      debugUtils.logDebug("Nilai fallback digunakan untuk optimizationUsed: false");
    }
    if (runs === undefined) {
      runs = 0;
      debugUtils.logDebug("Nilai fallback digunakan untuk runs: 0");
    }

    if (!address) {
      debugUtils.logError("Parameter 'address' tidak ditemukan atau kosong");
      return { success: false, message: "Alamat kontrak wajib diisi." };
    }

    if (!ethers.isAddress(address)) {
      debugUtils.logError("Format alamat tidak valid", { address });
      return { success: false, message: "Format alamat tidak valid." };
    }

    if (!sourceCodePayload) {
      debugUtils.logError("Parameter 'sourceCode' tidak ditemukan atau kosong");
      return { success: false, message: "Kode sumber wajib diisi." };
    }

    if (!fullContractName) {
      debugUtils.logError("Parameter 'contractName' tidak ditemukan atau kosong");
      return { success: false, message: "Nama kontrak wajib diisi." };
    }

    if (!compilerVersion) {
      debugUtils.logError("Parameter 'compilerVersion' tidak ditemukan atau kosong");
      return { success: false, message: "Versi compiler wajib diisi." };
    }

    const validatedInput = {
        address,
        sourceCodePayload,
        fullContractName,
        compilerVersion,
        optimizationUsed,
        runs,
        constructorArguments,
        evmVersion
    };

    debugUtils.logInfo("Parameter validasi berhasil", {
      address: address,
      fullContractName: fullContractName,
      compilerVersion: compilerVersion,
      optimizationUsed: optimizationUsed,
      runs: runs,
      constructorArgsPreview: constructorArguments?.slice(0, 20) + "..." || "tidak ada",
      sourceCodeLength: sourceCodePayload?.length || 0,
      evmVersion: evmVersion || "default",
    });

    return { success: true, validatedInput };
}