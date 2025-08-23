import * as contractModel from "./contract.model.js";
import { debugUtils } from "./verification.utils.js";

export async function saveVerificationResult(data) {
    debugUtils.logInfo("[verification.db.js] >> saveVerificationResult");
    const { address, mainContractName, compilerVersion, contractCompiled, solcInput, constructorArguments } = data;
    debugUtils.logStep(6, 6, "Menyimpan kontrak terverifikasi ke database");
    try {
        const sourceFiles = Object.entries(solcInput.sources).map(([filePath, contentObj]) => {
          const sourceCode = typeof contentObj === "string" ? contentObj : contentObj.content;
          return { filePath, sourceCode };
        });

        debugUtils.logInfo("Preparing contract data for database", {
          address,
          contractName: mainContractName,
          compilerVersion,
          abiLength: contractCompiled.abi?.length || 0,
          optimizationUsed: solcInput.settings.optimizer?.enabled || false,
          runs: solcInput.settings.optimizer?.runs,
          constructorArgumentsLength: constructorArguments?.length || 0,
          evmVersion: solcInput.settings.evmVersion || "default",
          sourceFilesCount: sourceFiles.length,
        });

        const savedContract = await contractModel.saveVerifiedContract(
          {
            address,
            contractName: mainContractName,
            compilerVersion,
            abi: JSON.stringify(contractCompiled.abi),
            optimizationUsed: solcInput.settings.optimizer?.enabled || false,
            runs: solcInput.settings.optimizer?.runs,
            constructorArguments,
            evmVersion: solcInput.settings.evmVersion || "default",
          },
          sourceFiles
        );
        debugUtils.logSuccess(`Kontrak berhasil diverifikasi dan disimpan!`);
        return { success: true, contract: savedContract };
    } catch (error) {
        debugUtils.logError("Error saat menyimpan ke database", error);
        return { success: false, message: `Verifikasi berhasil tapi gagal menyimpan: ${error.message}` };
    }
}