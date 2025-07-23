import * as contractModel from "./contract.model.js";
import { verify } from "./verification.service.js";
import { linkProxyContract } from "./contract.service.js";

// Cache sederhana untuk menyimpan status verifikasi
const verificationStatusCache = new Map();

/**
 * Menangani permintaan verifikasi dari Hardhat (GET dan POST).
 * @param {object} req Express request object.
 * @param {object} res Express response object.
 */
export async function handleHardhatVerification(req, res) {
  // GABUNGKAN body (untuk POST) dan query (untuk GET) menjadi satu objek
  const params = { ...req.query, ...req.body };
  const { module, action } = params; // Ambil dari objek gabungan

  const isGetRequest = req.method === "GET";

  console.log(`[API] Menerima permintaan Hardhat: method=${req.method}, module=${module}, action=${action}`);

  if (module !== "contract") {
    return res.status(400).send({ status: "0", message: "Invalid module" });
  }

  if (action === "getsourcecode" && isGetRequest) {
    return handleGetSourceCode(req, res);
  } else if (action === "verifysourcecode" && !isGetRequest) {
    return handleVerifySourceCode(req, res);
  } else if (action === "checkverifystatus" && isGetRequest) {
    return handleCheckVerifyStatus(req, res);
  } else if (action === "verifyproxycontract" && !isGetRequest) {
    return handleVerifyProxyContract(req, res);
  } else {
    return res.status(405).send({ status: "0", message: "Method Not Allowed or Invalid Action" });
  }
}

/**
 * Handler untuk GET /api?action=getsourcecode
 * @param {object} req
 * @param {object} res
 */
async function handleGetSourceCode(req, res) {
  const { address } = req.query;
  if (!address) {
    return res.status(400).send({ status: "0", message: "Missing address parameter" });
  }

  try {
    const verifiedContract = await contractModel.getContractByAddress(address);

    if (verifiedContract && verifiedContract.is_verified) {
      // sourceFiles sudah ada di dalam verifiedContract
      return res.status(200).send({
        status: "1",
        message: "OK",
        result: formatToEtherscanResponse(verifiedContract, verifiedContract.sourceFiles),
      });
    }

    // Jika ada di DB tapi belum diverifikasi, atau tidak ada sama sekali
    return res.status(200).send({ status: "1", message: "OK", result: [{ SourceCode: "" }] });
  } catch (error) {
    console.error(`[API][getsourcecode] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}

/**
 * Handler untuk POST /api?action=verifysourcecode
 * @param {object} req
 * @param {object} res
 */
async function handleVerifySourceCode(req, res) {
  const { contractaddress, sourceCode, contractname, compilerversion, optimizationUsed, runs, constructorArguements, evmversion } = req.body;

  try {
    const result = await verify({
      address: contractaddress,
      sourceCode,
      contractName: contractname, // Kirim full contract name dengan path
      compilerVersion: compilerversion,
      optimizationUsed,
      runs,
      constructorArguments: constructorArguements,
      evmVersion: evmversion,
    });

    if (result.success) {
      const guid = `vyper_${Date.now()}`;

      // Simpan status verifikasi di cache
      verificationStatusCache.set(guid, {
        status: "success",
        message: "Already verified",
        address: contractaddress,
      });

      return res.status(200).send({ status: "1", message: "OK", result: guid });
    } else {
      return res.status(200).send({ status: "0", message: "Error", result: result.message });
    }
  } catch (error) {
    console.error(`[API][verifysourcecode] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}

/**
 * Handler untuk GET /api?action=checkverifystatus
 * @param {object} req
 * @param {object} res
 */
async function handleCheckVerifyStatus(req, res) {
  const { guid } = req.query;

  if (!guid) {
    return res.status(400).send({ status: "0", message: "Missing guid parameter" });
  }

  try {
    const status = verificationStatusCache.get(guid);

    if (status) {
      // Periksa apakah kontrak benar-benar sudah diverifikasi di database
      const verifiedContract = await contractModel.getContractByAddress(status.address);

      if (verifiedContract && verifiedContract.is_verified) {
        // Hardhat-verify expects a specific success message.
        return res.status(200).send({
          status: "1",
          message: "OK",
          result: "Pass - Verified", // Mengirim pesan sukses yang dikenali
        });
      }
    }

    // Jika tidak ditemukan, beri respons pending
    return res.status(200).send({
      status: "1",
      message: "OK",
      result: "Pending in queue",
    });
  } catch (error) {
    console.error(`[API][checkverifystatus] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}

/**
 * Memformat data kontrak dari DB ke format yang diharapkan oleh Etherscan API.
 * @param {object} contractData
 * @param {Array<object>} sourceFiles
 * @returns {Array<object>}
 */
function formatToEtherscanResponse(contractData, sourceFiles) {
  let sourceCodeValue;

  // Jika hanya ada satu file dan path-nya standar (misal, Contract.sol),
  // kembalikan hanya kodenya untuk kompatibilitas.
  if (sourceFiles.length === 1 && sourceFiles[0].filePath.endsWith(".sol")) {
    sourceCodeValue = sourceFiles[0].sourceCode;
  } else {
    // Jika ada banyak file, format sebagai Standard JSON Input `sources`
    const sources = sourceFiles.reduce((acc, file) => {
      acc[file.filePath] = { content: file.sourceCode };
      return acc;
    }, {});
    sourceCodeValue = JSON.stringify({ sources });
  }

  return [
    {
      SourceCode: sourceCodeValue,
      ABI: contractData.abi,
      ContractName: contractData.contract_name,
      CompilerVersion: contractData.compiler_version,
      OptimizationUsed: contractData.optimization_used ? "1" : "0",
      Runs: String(contractData.runs || 0),
      ConstructorArguments: contractData.constructor_arguments || "",
      EVMVersion: contractData.evm_version || "Default",
      Library: "",
      LicenseType: "Unknown",
      Proxy: "0",
      Implementation: "",
      SwarmSource: "",
    },
  ];
}

/**
 * Handler untuk POST /api?action=verifyproxycontract
 * @param {object} req
 * @param {object} res
 */
async function handleVerifyProxyContract(req, res) {
  const { address, expectedimplementation } = req.body;

  try {
    const result = await linkProxyContract({
      proxyAddress: address,
      implementationAddress: expectedimplementation,
    });

    if (result.success) {
      // Menggunakan GUID yang sama dengan verifikasi biasa untuk konsistensi
      const guid = `proxy_${Date.now()}`;
      verificationStatusCache.set(guid, {
        status: "success",
        message: "Proxy verified",
        address: address,
      });
      return res.status(200).send({ status: "1", message: "OK", result: guid });
    } else {
      return res.status(200).send({ status: "0", message: "Error", result: result.message });
    }
  } catch (error) {
    console.error(`[API][verifyproxycontract] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}
