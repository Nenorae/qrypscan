// api/src/features/contracts/verification.service.js
import { ethers } from "ethers";
import solc from "solc";
import config from "../../config/index.js";
import * as contractModel from "./contract.model.js";
import { stripMetadata, analyzeBytecode, compareBytecode } from "./bytecode.utils.js";

const provider = new ethers.JsonRpcProvider(config.node.rpcUrl);

/**
 * Memverifikasi dan menyimpan data kontrak.
 * @param {object} input Data input dari GraphQL mutation atau Hardhat.
 * @returns {Promise<object>}
 */
export async function verify(input) {
  console.log("--- DEBUG: Memulai Proses Verifikasi Kontrak ---");
  console.log("🔍 Input yang diterima:", JSON.stringify(input, null, 2));

  const { address, sourceCode: sourceCodePayload, contractName: fullContractName, compilerVersion, optimizationUsed, runs, constructorArguments } = input;

  console.log("📋 Parameter yang di-extract:");
  console.log(`   - Address: ${address}`);
  console.log(`   - Full Contract Name: ${fullContractName}`);
  console.log(`   - Compiler Version: ${compilerVersion}`);
  console.log(`   - Optimization Used: ${optimizationUsed}`);
  console.log(`   - Runs: ${runs}`);
  console.log(`   - Constructor Arguments: ${constructorArguments}`);
  console.log(`   - Source Code Length: ${sourceCodePayload?.length || 0} characters`);

  let solcInput;
  let mainContractName;
  let mainSourceCode;
  let contractPath;

  console.log(`[1/5] Mengambil bytecode untuk alamat: ${address}`);
  console.log(`🌐 Connecting to RPC: ${config.node.rpcUrl}`);

  try {
    const deployedBytecode = await provider.getCode(address);
    console.log(`📦 Deployed bytecode retrieved: ${deployedBytecode.slice(0, 20)}...`);
    console.log(`📏 Deployed bytecode length: ${deployedBytecode.length} characters`);

    if (deployedBytecode === "0x" || !deployedBytecode) {
      console.error("❌ No bytecode found at address");
      return { success: false, message: "Alamat yang diberikan bukan merupakan kontrak atau tidak memiliki bytecode." };
    }

    console.log("🔬 Analyzing deployed bytecode...");
    analyzeBytecode(deployedBytecode.slice(2), "DEPLOYED");

    console.log(`[2/5] Menyiapkan input untuk solc v${compilerVersion}`);
    console.log(`🔍 Checking source code format...`);

    // [FIX] Cek apakah payload adalah Standard JSON Input dari Hardhat
    if (sourceCodePayload.startsWith("{")) {
      console.log("   - Mode deteksi: Standard JSON Input");
      console.log("📄 Parsing Standard JSON Input...");

      try {
        solcInput = JSON.parse(sourceCodePayload);
        console.log("✅ JSON parsing successful");
        console.log("📂 Available sources in JSON:", Object.keys(solcInput.sources || {}));

        [contractPath, mainContractName] = fullContractName.split(":");
        console.log(`📁 Contract path: ${contractPath}`);
        console.log(`📝 Main contract name: ${mainContractName}`);

        mainSourceCode = solcInput.sources[contractPath]?.content;
        if (!mainSourceCode) {
          console.error(`❌ File path '${contractPath}' not found in sources`);
          throw new Error(`File path '${contractPath}' tidak ditemukan di dalam Standard JSON Input.`);
        }

        console.log(`📄 Source code length: ${mainSourceCode.length} characters`);
        console.log("🛠️ Processing settings...");

        // Pastikan settings dari Hardhat dihormati
        solcInput.settings = solcInput.settings || {};
        console.log("⚙️ Current settings:", JSON.stringify(solcInput.settings, null, 2));

        solcInput.settings.optimizer = solcInput.settings.optimizer || { enabled: optimizationUsed === "1", runs: parseInt(runs) || 200 };
        solcInput.settings.outputSelection = solcInput.settings.outputSelection || { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } };

        console.log("✅ Final settings:", JSON.stringify(solcInput.settings, null, 2));
      } catch (e) {
        console.error("❌ Error parsing JSON:", e.message);
        return { success: false, message: `Gagal mem-parsing Standard JSON Input: ${e.message}` };
      }
    } else {
      console.log("   - Mode deteksi: Kode sumber tunggal");
      console.log("📄 Processing single source code...");

      mainContractName = fullContractName;
      mainSourceCode = sourceCodePayload;
      contractPath = `${mainContractName}.sol`;

      console.log(`📁 Generated contract path: ${contractPath}`);
      console.log(`📄 Source code length: ${mainSourceCode.length} characters`);

      console.log("🛠️ Creating solc input...");
      solcInput = createSolcInput(mainContractName, mainSourceCode, optimizationUsed, runs);
      console.log("✅ Solc input created:", JSON.stringify(solcInput, null, 2));
    }

    console.log(`[3/5] Meng-compile kode sumber dengan solc...`);
    console.log("🔨 Starting compilation...");
    console.log("📊 Solc input summary:");
    console.log(`   - Language: ${solcInput.language}`);
    console.log(`   - Sources: ${Object.keys(solcInput.sources).join(", ")}`);
    console.log(`   - Optimizer enabled: ${solcInput.settings.optimizer?.enabled || false}`);
    console.log(`   - Optimizer runs: ${solcInput.settings.optimizer?.runs || "N/A"}`);
    console.log(`   - EVM Version: ${solcInput.settings.evmVersion || "default"}`);

    const compiledOutput = JSON.parse(solc.compile(JSON.stringify(solcInput)));
    console.log("✅ Compilation completed");

    if (compiledOutput.errors) {
      console.log("⚠️ Compilation errors/warnings found:");
      compiledOutput.errors.forEach((err, index) => {
        console.log(`   ${index + 1}. [${err.severity}] ${err.formattedMessage}`);
      });

      const errors = compiledOutput.errors.filter((err) => err.severity === "error");
      if (errors.length > 0) {
        const errorMessages = errors.map((err) => err.formattedMessage).join("\n");
        console.error("❌ Gagal: Terjadi error saat kompilasi:", errorMessages);
        return { success: false, message: `Kompilasi gagal: ${errorMessages}` };
      }
    }

    console.log("📂 Compiled contracts:");
    Object.keys(compiledOutput.contracts || {}).forEach((file) => {
      console.log(`   File: ${file}`);
      Object.keys(compiledOutput.contracts[file] || {}).forEach((contract) => {
        console.log(`     - Contract: ${contract}`);
      });
    });

    const contractCompiled = compiledOutput.contracts[contractPath]?.[mainContractName];
    if (!contractCompiled) {
      const availableContracts = Object.keys(compiledOutput.contracts[contractPath] || {}).join(", ");
      const message = `Kompilasi berhasil, namun tidak dapat menemukan artifak untuk kontrak bernama "${mainContractName}" di file ${contractPath}. Kontrak yang tersedia: [${availableContracts}]`;
      console.error("❌", message);
      return { success: false, message };
    }

    console.log("✅ Contract artifact found");

    const runtimeBytecode = "0x" + contractCompiled.evm.deployedBytecode.object;
    const abi = JSON.stringify(contractCompiled.abi);

    console.log(`📦 Runtime bytecode: ${runtimeBytecode.slice(0, 20)}...`);
    console.log(`📏 Runtime bytecode length: ${runtimeBytecode.length} characters`);
    console.log(`📋 ABI length: ${abi.length} characters`);

    console.log("🔬 Analyzing compiled bytecode...");
    analyzeBytecode(runtimeBytecode.slice(2), "COMPILED");

    console.log("[4/5] Membandingkan bytecode...");
    console.log("🔍 Bytecode comparison details:");
    console.log(`   - Deployed: ${deployedBytecode.slice(0, 20)}... (${deployedBytecode.length} chars)`);
    console.log(`   - Compiled: ${runtimeBytecode.slice(0, 20)}... (${runtimeBytecode.length} chars)`);

    const { isIdentical } = compareBytecode(deployedBytecode, runtimeBytecode);
    console.log(`🔍 Comparison result: ${isIdentical ? "IDENTICAL" : "DIFFERENT"}`);

    if (isIdentical) {
      console.log("   ✅ Bytecode COCOK!");
      console.log(`[5/5] Menyimpan kontrak terverifikasi ke database...`);

      const contractData = {
        address,
        contractName: mainContractName,
        compilerVersion,
        abi,
        optimizationUsed,
        runs,
        constructorArguments,
        evmVersion: solcInput.settings.evmVersion || "default",
      };

      // [MODIFIED] Siapkan array source files untuk disimpan
      const sourceFiles = Object.entries(solcInput.sources).map(([filePath, contentObj]) => ({
        filePath,
        sourceCode: contentObj.content,
      }));

      console.log("💾 Saving contract data and source files...");
      console.log(`   - Files to save: ${sourceFiles.length}`);

      const savedContract = await contractModel.saveVerifiedContract(contractData, sourceFiles);
      console.log("✅ Contract saved successfully!");
      console.log("📄 Saved contract info:", JSON.stringify(savedContract, null, 2));

      return { success: true, message: "Kontrak berhasil diverifikasi!", contract: savedContract };
    } else {
      console.error("❌ Gagal: Bytecode TIDAK COCOK.");
      console.log("🔍 Debugging bytecode mismatch:");
      console.log(`   - Deployed length: ${deployedBytecode.length}`);
      console.log(`   - Compiled length: ${runtimeBytecode.length}`);
      console.log(`   - First 100 chars deployed: ${deployedBytecode.slice(0, 100)}`);
      console.log(`   - First 100 chars compiled: ${runtimeBytecode.slice(0, 100)}`);

      return { success: false, message: "Bytecode tidak cocok. Pastikan semua parameter (versi compiler, optimisasi, dll) sudah benar." };
    }
  } catch (error) {
    console.error("❌ Unexpected error during verification:", error);
    console.error("🔍 Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return { success: false, message: `Terjadi kesalahan: ${error.message}` };
  }
}

/**
 * Membuat objek input untuk compiler solc.
 * @param {string} contractName
 * @param {string} sourceCode
 * @param {boolean} optimizationUsed
 * @param {number} runs
 * @returns {object} Input object untuk solc.
 */
function createSolcInput(contractName, sourceCode, optimizationUsed, runs) {
  console.log("🛠️ createSolcInput called with:");
  console.log(`   - contractName: ${contractName}`);
  console.log(`   - sourceCode length: ${sourceCode.length} chars`);
  console.log(`   - optimizationUsed: ${optimizationUsed}`);
  console.log(`   - runs: ${runs}`);

  const optimizationEnabled = optimizationUsed === "1";
  const runsValue = parseInt(runs) || 200;

  console.log(`   - optimizationEnabled: ${optimizationEnabled}`);
  console.log(`   - runsValue: ${runsValue}`);

  const solcInput = {
    language: "Solidity",
    sources: {
      [contractName + ".sol"]: {
        content: sourceCode,
      },
    },
    settings: {
      evmVersion: "london", 
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"],
        },
      },
    },
  };

  if (optimizationEnabled) {
    console.log("✅ Adding optimizer settings");
    solcInput.settings.optimizer = {
      enabled: true,
      runs: runsValue,
    };
  } else {
    console.log("❌ Optimizer disabled");
  }

  console.log("📄 Final solcInput:", JSON.stringify(solcInput, null, 2));
  return solcInput;
}
