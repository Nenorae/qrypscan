import { ethers } from "ethers";
import config from "../../config/index.js";
import * as contractModel from "./contract.model.js";
import { verify } from "./verification.service.js";
import { linkProxyContract } from "./contract.service.js";
import { getLogs as getLogsFromDb } from "../logs/log.service.js";
import logger from "../../core/logger.js";

// Cache sederhana untuk menyimpan status verifikasi
const verificationStatusCache = new Map();
const provider = new ethers.JsonRpcProvider(config.node.rpcUrl);

/**
 * Menangani permintaan verifikasi dari Hardhat (GET dan POST).
 * Bertindak sebagai router utama untuk semua action.
 * @param {object} req Express request object.
 * @param {object} res Express response object.
 */
export async function handleHardhatVerification(req, res) {
  logger.info("[hardhat.handler.js] >> handleHardhatVerification");
  // GABUNGKAN body (untuk POST) dan query (untuk GET) menjadi satu objek
  const params = { ...req.query, ...req.body };
  const { module, action } = params;

  logger.info(`[API] Menerima permintaan Hardhat: method=${req.method}, module=${module}, action=${action}`);
  logger.debug(`[Hardhat Handler] Request params:`, params);

  if (module === "contract") {
    if (action === "getsourcecode") {
      return handleGetSourceCode(params, res);
    } else if (action === "verifysourcecode") {
      return handleVerifySourceCode(params, res);
    } else if (action === "checkverifystatus" || action === "checkproxyverification") {
      return handleCheckVerifyStatus(params, res);
    } else if (action === "verifyproxycontract") {
      return handleVerifyProxyContract(params, res);
    }
  } else if (module === "logs") {
    if (action === "getLogs") {
      return handleGetLogs(params, res);
    }
  }

  return res.status(400).send({ status: "0", message: "Invalid module or action" });
}

/**
 * Handler untuk action=getLogs
 * @param {object} params Parameter gabungan dari query/body
 * @param {object} res Express response object
 */
async function handleGetLogs(params, res) {
  logger.info("[hardhat.handler.js] >> handleGetLogs");
  try {
    const response = await getLogsFromDb(params);
    return res.status(200).send(response);
  } catch (error) {
    logger.error(`[API][getlogs] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error", result: error.message });
  }
}

/**
 * Handler untuk action=getsourcecode
 * @param {object} params Parameter gabungan dari query/body
 * @param {object} res Express response object
 */
async function handleGetSourceCode(params, res) {
  logger.info("[hardhat.handler.js] >> handleGetSourceCode");
  const { address } = params;
  if (!address) {
    return res.status(400).send({ status: "0", message: "Missing address parameter" });
  }

  try {
    const verifiedContract = await contractModel.getContractByAddress(address);

    if (verifiedContract && verifiedContract.is_verified) {
      return res.status(200).send({
        status: "1",
        message: "OK",
        result: formatToEtherscanResponse(verifiedContract, verifiedContract.sourceFiles),
      });
    }

    return res.status(200).send({ status: "1", message: "OK", result: [{ SourceCode: "" }] });
  } catch (error) {
    logger.error(`[API][getsourcecode] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}

/**
 * Handler untuk action=verifysourcecode
 * @param {object} params Parameter gabungan dari query/body
 * @param {object} res Express response object
 */
async function handleVerifySourceCode(params, res) {
  logger.info("[hardhat.handler.js] >> handleVerifySourceCode");
  const { contractaddress, sourceCode, contractname, compilerversion, optimizationUsed, runs, constructorArguements, evmversion } = params;

  try {
    const result = await verify({
      address: contractaddress,
      sourceCode,
      contractName: contractname,
      compilerVersion: compilerversion,
      optimizationUsed,
      runs,
      constructorArguments: constructorArguements,
      evmVersion: evmversion,
    });

    if (result.success) {
      const guid = `vyper_${Date.now()}`;
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
    logger.error(`[API][verifysourcecode] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}

/**
 * Handler untuk action=checkverifystatus
 * @param {object} params Parameter gabungan dari query/body
 * @param {object} res Express response object
 */
async function handleCheckVerifyStatus(params, res) {
  logger.info("[hardhat.handler.js] >> handleCheckVerifyStatus");
  const { guid } = params;
  if (!guid) {
    return res.status(400).send({ status: "0", message: "Missing guid parameter" });
  }

  try {
    const status = verificationStatusCache.get(guid);
    if (status) {
      const verifiedContract = await contractModel.getContractByAddress(status.address);
      if (verifiedContract && verifiedContract.is_verified) {
        return res.status(200).send({
          status: "1",
          message: "OK",
          result: "Pass - Verified",
        });
      }
    }

    return res.status(200).send({
      status: "1",
      message: "OK",
      result: "Pending in queue",
    });
  } catch (error) {
    logger.error(`[API][checkverifystatus] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}

/**
 * Handler untuk action=verifyproxycontract
 * @param {object} params Parameter gabungan dari query/body
 * @param {object} res Express response object
 */
async function handleVerifyProxyContract(params, res) {
  logger.info("[hardhat.handler.js] >> handleVerifyProxyContract");
  logger.info(`[API] Menerima permintaan verifikasi proxy contract:`, params);
  const { address, expectedimplementation } = params;

  try {
    const result = await linkProxyContract({
      proxyAddress: address,
      implementationAddress: expectedimplementation,
    });

    if (result.success) {
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
    logger.error(`[API][verifyproxycontract] ❌ Error:`, error);
    return res.status(500).send({ status: "0", message: "Internal Server Error" });
  }
}

/**
 * Memformat data kontrak dari DB ke format yang diharapkan oleh Etherscan API.
 * (Fungsi ini tidak perlu diubah)
 * @param {object} contractData
 * @param {Array<object>} sourceFiles
 * @returns {Array<object>}
 */
function formatToEtherscanResponse(contractData, sourceFiles) {
  logger.info("[hardhat.handler.js] >> formatToEtherscanResponse");
  let sourceCodeValue;

  if (sourceFiles && sourceFiles.length === 1 && sourceFiles[0].filePath.endsWith(".sol")) {
    sourceCodeValue = sourceFiles[0].sourceCode;
  } else if (sourceFiles && sourceFiles.length > 0) {
    const sources = sourceFiles.reduce((acc, file) => {
      acc[file.filePath] = { content: file.sourceCode };
      return acc;
    }, {});
    sourceCodeValue = JSON.stringify({ sources });
  } else {
    sourceCodeValue = "";
  }

  return [
    {
      SourceCode: sourceCodeValue,
      ABI: contractData.abi ? JSON.stringify(contractData.abi) : "",
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