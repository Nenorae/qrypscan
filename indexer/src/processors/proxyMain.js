// File: indexer/src/processors/proxyMain.js

import { ethers } from "ethers";
import { getDbPool } from "../db/connect.js";
import { 
  updateContractProxyImplementation,
  recordProxyUpgrade,
  storeDiamondCut,
  updateBeaconProxyInfo
} from "../db/queries/index.js";
import { IMPLEMENTATION_SLOT, ADMIN_SLOT, PROXY_EVENT_SIGNATURES, proxyInterfaces } from "./proxyConstants.js";
import { processingStats } from "./proxyStats.js";

// Minimal ABI to get implementation from a beacon contract
const beaconAbi = ["function implementation() view returns (address)"];

/**
 * Checks if a contract at a given address is a proxy by checking EIP-1967 storage slots.
 * @param {string} address The contract address to check.
 * @param {ethers.Provider} provider The ethers provider to use for the RPC call.
 * @returns {Promise<object>} An object with proxy status details.
 */
export async function checkProxyStatus(address, provider) {
  try {
    const implementationHex = await provider.getStorageAt(address, IMPLEMENTATION_SLOT);
    const adminHex = await provider.getStorageAt(address, ADMIN_SLOT);

    const implementationAddress = ethers.isHexString(implementationHex) && implementationHex.length > 42
        ? ethers.getAddress(ethers.dataSlice(implementationHex, 12))
        : null;

    const adminAddress = ethers.isHexString(adminHex) && adminHex.length > 42
        ? ethers.getAddress(ethers.dataSlice(adminHex, 12))
        : null;

    const isProxy = implementationAddress !== null && implementationAddress !== ethers.ZeroAddress;

    return {
      is_proxy: isProxy,
      implementation_address: implementationAddress,
      admin_address: adminAddress,
    };
  } catch (error) {
    console.error(`💥 [PROXY-CHECK] Error checking proxy status for ${address}:`, error.message);
    return {
      is_proxy: false,
      implementation_address: null,
      admin_address: null,
      error: error.message,
    };
  }
}

/**
 * Enhanced proxy upgrade log processor with comprehensive debugging and multiple proxy pattern support
 * @param {object} log - The log object from the provider
 * @param {number} blockTimestamp - The timestamp of the block.
 * @param {ethers.Provider} provider - The Ethers provider.
 * @param {object} [existingClient=null] - Optional existing database client
 */
export async function processProxyUpgradeLog(log, blockTimestamp, provider, existingClient = null) {
  const startTime = Date.now();
  const logId = `${log.transactionHash}-${log.logIndex || 0}`;

  processingStats.totalProcessed++;

  try {
    // Validate log structure
    if (!log.topics || log.topics.length === 0) {
      console.warn(`⚠️  [PROXY-WARN] Log ${logId} has no topics, skipping`);
      return { success: false, reason: "no_topics" };
    }

    const eventTopic = log.topics[0];
    const proxyType = detectProxyType(eventTopic);

    if (!proxyType) {
      // This is not a recognized proxy upgrade event, so we just ignore it.
      return { success: false, reason: "not_proxy_event" };
    }

    console.log(`✅ [PROXY-DETECT] Detected ${proxyType} proxy event at ${log.address}`);

    const client = existingClient || (await getDbPool().connect());
    let ownTransaction = !existingClien
    try {
      if (ownTransaction) await client.query("BEGIN");

      // Check if we already processed this log to prevent duplicates
      const existingRecord = await client.query("SELECT 1 FROM proxy_upgrades WHERE tx_hash = $1 AND log_index = $2 LIMIT 1", [log.transactionHash, log.logIndex || 0]);
      if (existingRecord.rowCount > 0) {
        console.log(`⏭️  [PROXY-SKIP] Log ${logId} already processed, skipping`);
        if (ownTransaction) await client.query("ROLLBACK");
        return { success: true, reason: "already_processed" };
      }

      // Process based on proxy type
      let processingResult;
      switch (proxyType) {
        case "upgradeable":
          processingResult = await processUpgradeableProxy(log, blockTimestamp, client);
          break;
        case "diamond":
          processingResult = await processDiamondProxy(log, blockTimestamp, client);
          break;
        case "beacon":
          // Beacon processing needs the provider to find the implementation address
          processingResult = await processBeaconProxy(log, blockTimestamp, client, provider);
          break;
        default:
          throw new Error(`Unsupported proxy type: ${proxyType}`);
      }

      if (!processingResult.success) {
        throw new Error(processingResult.error || "Unknown processing error");
      }

      if (ownTransaction) await client.query("COMMIT");

      const processingTime = Date.now() - startTime;
      processingStats.successfulProcessed++;
      console.log(`🎉 [PROXY-SUCCESS] Successfully processed ${proxyType} proxy upgrade in ${processingTime}ms for ${log.address}`);

      return {
        success: true,
        proxyType,
        data: processingResult.data,
        processingTime,
      };
    } catch (dbError) {
      if (ownTransaction) await client.query("ROLLBACK");
      throw dbError; // Re-throw to be caught by the outer catch block
    } finally {
      if (ownTransaction) client.release();
    }
  } catch (error) {
    processingStats.errors++;
    const processingTime = Date.now() - startTime;
    console.error(`💥 [PROXY-ERROR] Failed to process log ${logId} in ${processingTime}ms: ${error.message}`);
    if (existingClient) throw error; // Re-throw if using an external transaction
    return { success: false, error: error.message, processingTime };
  }
}

function detectProxyType(eventTopic) {
  switch (eventTopic) {
    case PROXY_EVENT_SIGNATURES.UPGRADED:
      return "upgradeable";
    case PROXY_EVENT_SIGNATURES.DIAMOND_CUT:
      return "diamond";
    case PROXY_EVENT_SIGNATURES.BEACON_UPGRADED:
      return "beacon";
    default:
      return null;
  }
}

async function processUpgradeableProxy(log, blockTimestamp, client) {
  const parsedLog = proxyInterfaces.upgradeable.parseLog(log);
  if (!parsedLog) throw new Error("Failed to parse Upgraded event");

  const { implementation } = parsedLog.args;
  if (!ethers.isAddress(implementation)) throw new Error(`Invalid implementation address: ${implementation}`);

  // 1. Update the current state in the `contracts` table
  await updateContractProxyImplementation(client, log.address, implementation);

  // 2. Record the historical upgrade event
  await recordProxyUpgrade(client, {
    proxyAddress: log.address,
    implementationAddress: implementation,
    proxyType: 'Upgradeable',
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    blockTimestamp: new Date(blockTimestamp * 1000),
  });

  return { success: true, data: { newImplementation: implementation } };
}

async function processDiamondProxy(log, blockTimestamp, client) {
  const parsedLog = proxyInterfaces.diamond.parseLog(log);
  if (!parsedLog) throw new Error("Failed to parse DiamondCut event");

  const { _diamondCut } = parsedLog.args;
  const blockTime = new Date(blockTimestamp * 1000);

  for (const cut of _diamondCut) {
    for (const selector of cut.functionSelectors) {
      await storeDiamondCut(client, {
        proxyAddress: log.address,
        facetAddress: cut.facetAddress,
        action: cut.action, // 0=Add, 1=Replace, 2=Remove
        functionSelectors: [selector],
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        blockTimestamp: blockTime,
      });
    }
  }

  return { success: true, data: { facetOperations: _diamondCut.length } };
}

async function processBeaconProxy(log, blockTimestamp, client, provider) {
  const parsedLog = proxyInterfaces.beacon.parseLog(log);
  if (!parsedLog) throw new Error("Failed to parse BeaconUpgraded event");

  const { beacon } = parsedLog.args;
  if (!ethers.isAddress(beacon)) throw new Error(`Invalid beacon address: ${beacon}`);

  // A beacon upgrade points to the beacon, not the implementation.
  // We need to call the beacon contract to find the actual implementation address.
  const beaconContract = new ethers.Contract(beacon, beaconAbi, provider);
  const implementation = await beaconContract.implementation();
  if (!ethers.isAddress(implementation)) throw new Error(`Beacon at ${beacon} returned invalid implementation address: ${implementation}`);

  // 1. Update the proxy's current implementation in the `contracts` table
  await updateContractProxyImplementation(client, log.address, implementation);
  
  // 2. Store the relationship between this proxy and its beacon
  await updateBeaconProxyInfo(client, log.address, beacon);

  // 3. Record the historical upgrade event
  await recordProxyUpgrade(client, {
    proxyAddress: log.address,
    implementationAddress: implementation,
    proxyType: 'Beacon',
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    blockTimestamp: new Date(blockTimestamp * 1000),
  });

  return { success: true, data: { newImplementation: implementation, beaconAddress: beacon } };
}
