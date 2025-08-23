import solc from "solc";
import { debugUtils } from "./verification.utils.js";

function createSolcInput(contractName, sourceCode, { optimizationUsed, runs, evmVersion }) {
  debugUtils.logInfo("[verification.compiler.js] >> createSolcInput");
  debugUtils.logDebug("Creating solc input", {
    contractName,
    sourceCodeLength: sourceCode?.length || 0,
    optimizationUsed,
    runs,
    evmVersion,
  });

  if (!contractName) {
    throw new Error("Contract name is required");
  }

  if (!sourceCode || typeof sourceCode !== "string") {
    throw new Error("Source code must be a non-empty string");
  }

  // Default optimization to false (0) if not provided
  const isOptimizerEnabled = optimizationUsed === "1" || optimizationUsed === true || optimizationUsed === "true";

  // Default runs to 0 if not provided or invalid
  let runsValue = 0;
  if (runs !== undefined && runs !== null) {
    const parsedRuns = parseInt(runs);
    if (isNaN(parsedRuns) || parsedRuns < 0) {
      debugUtils.logWarning(`Invalid runs value: ${runs}, using default: 0`);
    } else {
      runsValue = parsedRuns;
    }
  }

  debugUtils.logDebug("Optimization settings processed", {
    isOptimizerEnabled,
    runsValue,
    originalRuns: runs,
  });

  const settings = {
    optimizer: {
      enabled: isOptimizerEnabled,
      runs: isOptimizerEnabled ? runsValue || 200 : 0, // Use 200 only if optimizer is enabled and no custom runs
      // enabled: false,
      // runs: 0, // Default to 0 if not using optimizer
    },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"],
      },
    },
  };

  if (evmVersion && evmVersion.toLowerCase() !== "default" && evmVersion.trim() !== "") {
    settings.evmVersion = evmVersion.trim();
    debugUtils.logInfo(`Using EVM version: ${evmVersion.trim()}`);
  } else {
    debugUtils.logInfo("Using default EVM version");
  }

  const solcInput = {
    language: "Solidity",
    sources: {
      [`${contractName}.sol`]: {
        content: sourceCode,
      },
    },
    settings: settings,
  };

  debugUtils.logDebug("Solc input created successfully", {
    language: solcInput.language,
    sourcesCount: Object.keys(solcInput.sources).length,
    optimizerEnabled: settings.optimizer.enabled,
    optimizerRuns: settings.optimizer.runs,
    evmVersion: settings.evmVersion || "default",
  });

  return solcInput;
}

export function prepareSolcInput(validatedInput) {
  debugUtils.logInfo("[verification.compiler.js] >> prepareSolcInput");
  const { sourceCodePayload, fullContractName, optimizationUsed, runs, evmVersion } = validatedInput;

  debugUtils.logStep(2, 6, "Menyiapkan input untuk kompilasi solc");

  try {
    let solcInput;
    let mainContractName;
    let contractPath;
    let inputMode;

    if (sourceCodePayload.trim().startsWith("{")) {
      inputMode = "Standard JSON Input";
      debugUtils.logInfo("Mode deteksi: Standard JSON Input");

      try {
        solcInput = JSON.parse(sourceCodePayload);

        debugUtils.logDebug("INI ISI ASLI DARI JSON", {
          optimizerSettings: solcInput.settings.optimizer,
        });

      } catch (parseError) {
        debugUtils.logError("Gagal parsing JSON input", parseError);
        return { success: false, message: `Format JSON tidak valid: ${parseError.message}` };
      }

      solcInput.settings = solcInput.settings || {};
      solcInput.settings.optimizer = solcInput.settings.optimizer || {};

      // Set default optimization settings if not provided
      if (solcInput.settings.optimizer.enabled === undefined) {
        solcInput.settings.optimizer.enabled = optimizationUsed === "1" || optimizationUsed === true || optimizationUsed === "true" || false;
      }
      if (solcInput.settings.optimizer.runs === undefined) {
        solcInput.settings.optimizer.runs = runs !== undefined && runs !== null ? parseInt(runs) || 0 : 0;
      }

      if (fullContractName.includes(":")) {
        [contractPath, mainContractName] = fullContractName.split(":");
      } else {
        mainContractName = fullContractName;
        const sourcePaths = Object.keys(solcInput.sources || {});
        contractPath = sourcePaths.find((path) => path.includes(mainContractName)) || sourcePaths[0];
      }

      const validationErrors = [];
      if (!solcInput.language) validationErrors.push("Missing 'language' field");
      if (!solcInput.sources) validationErrors.push("Missing 'sources' field");
      if (!solcInput.settings) validationErrors.push("Missing 'settings' field");
      if (Object.keys(solcInput.sources).length === 0) validationErrors.push("Empty 'sources' object");

      if (validationErrors.length > 0) {
        debugUtils.logError("Standard JSON Input tidak valid", { validationErrors });
        return { success: false, message: `Standard JSON Input tidak valid: ${validationErrors.join(", ")}` };
      }
    } else {
      inputMode = "Single Source Code";
      mainContractName = fullContractName;
      contractPath = `${mainContractName}.sol`;

      // Pass default values of 0 for optimization if not provided
      const optimizationConfig = {
        optimizationUsed: optimizationUsed !== undefined ? optimizationUsed : false,
        runs: runs !== undefined ? runs : 0,
        evmVersion,
      };

      solcInput = createSolcInput(mainContractName, sourceCodePayload, optimizationConfig);
    }

    debugUtils.logSuccess(`Input mode: ${inputMode}`);
    debugUtils.logInfo("Solc input summary", {
      language: solcInput.language,
      sourcesCount: Object.keys(solcInput.sources).length,
      sourcesList: Object.keys(solcInput.sources).join(", "),
      mainContract: mainContractName,
      contractPath: contractPath,
      optimizer_enabled: solcInput.settings.optimizer?.enabled || false,
      optimizer_runs: solcInput.settings.optimizer?.runs || 0,
      evm_version: solcInput.settings.evmVersion || "default",
    });

    return { success: true, solcInput, mainContractName, contractPath };
  } catch (error) {
    debugUtils.logError("Error saat menyiapkan solc input", error);
    return { success: false, message: `Gagal menyiapkan input kompilasi: ${error.message}` };
  }
}

export function compile(solcInput) {
  debugUtils.logInfo("[verification.compiler.js] >> compile");
  debugUtils.logStep(3, 6, "Mengkompilasi kode sumber dengan solc");

  try {
    console.log(`🔧 Compiling with solc version: ${solc.version()}`);
    console.log(`📝 Compiler input preview:`, JSON.stringify(solcInput, null, 2).slice(0, 500) + "...");

    const compilationStart = Date.now();
    const compileResult = solc.compile(JSON.stringify(solcInput));
    const compilationTime = Date.now() - compilationStart;

    debugUtils.logInfo(`Kompilasi selesai dalam ${compilationTime}ms`);

    const compiledOutput = JSON.parse(compileResult);

    if (compiledOutput.errors) {
      const errors = compiledOutput.errors.filter((err) => err.severity === "error");
      if (errors.length > 0) {
        debugUtils.logError(`${errors.length} compilation errors ditemukan`);
        errors.forEach((error, index) => {
          console.error(`❌ Error ${index + 1}: ${error.formattedMessage}`);
        });
        const errorMessages = errors.map((err) => err.formattedMessage).join("\n");
        return { success: false, message: `Kompilasi gagal dengan ${errors.length} error(s): ${errorMessages}` };
      }
    }

    debugUtils.logSuccess("Kompilasi berhasil tanpa error");
    return { success: true, compiledOutput };
  } catch (error) {
    debugUtils.logError("Error saat kompilasi", error);
    return { success: false, message: `Kompilasi gagal: ${error.message}` };
  }
}

export function extractContractArtifact(compiledOutput, contractPath, mainContractName) {
  debugUtils.logInfo("[verification.compiler.js] >> extractContractArtifact");
  debugUtils.logStep(4, 6, "Mengekstrak artifak kontrak hasil kompilasi");

  debugUtils.logDebug("Looking for compiled contract", {
    contractPath,
    mainContractName,
    availablePaths: Object.keys(compiledOutput.contracts || {}),
  });

  const contractsInPath = compiledOutput.contracts[contractPath];
  if (!contractsInPath) {
    const availablePaths = Object.keys(compiledOutput.contracts || {});
    debugUtils.logError("Contract path tidak ditemukan dalam hasil kompilasi", { searchedPath: contractPath, availablePaths });
    return { success: false, message: `Path kontrak \"${contractPath}\" tidak ditemukan. Available paths: [${availablePaths.join(", ")}]` };
  }

  const contractCompiled = contractsInPath[mainContractName];
  if (!contractCompiled) {
    const availableContracts = Object.keys(contractsInPath);
    debugUtils.logError("Contract tidak ditemukan dalam path", { searchedContract: mainContractName, availableContracts, contractPath });
    return { success: false, message: `Kontrak \"${mainContractName}\" tidak ditemukan dalam \"${contractPath}\". Available contracts: [${availableContracts.join(", ")}]` };
  }

  debugUtils.logSuccess("Contract artifact berhasil diekstrak");
  debugUtils.logDebug("Contract artifact info", {
    hasAbi: !!contractCompiled.abi,
    abiLength: contractCompiled.abi?.length || 0,
    hasBytecode: !!contractCompiled.evm?.bytecode?.object,
    hasDeployedBytecode: !!contractCompiled.evm?.deployedBytecode?.object,
    bytecodeLength: contractCompiled.evm?.bytecode?.object?.length || 0,
    deployedBytecodeLength: contractCompiled.evm?.deployedBytecode?.object?.length || 0,
  });

  return { success: true, contractCompiled };
}