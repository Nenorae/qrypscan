// File: indexer/src/proxyProcessor.js

import { ethers } from "ethers";
import { getDbPool } from "./db/connect.js";
import { updateProxyImplementation } from "./db/queries.js";

// Event signatures for various proxy patterns
export const PROXY_EVENT_SIGNATURES = {
  // OpenZeppelin Upgradeable Proxy
  UPGRADED: "0xbc7cd75a20ee27fd9adebabcf784c44594004fee1e8ca125ba64cc182b75ceae",
  // Diamond Proxy (EIP-2535)
  DIAMOND_CUT: "0x8faa70878671ccd212d20771b795c50af8fd3ff6cf27f4bde57e5d4de0aeb673",
  // Beacon Proxy
  BEACON_UPGRADED: "0xa2fd66f94dceb9fcc67b0f5f1e6b3c3e1c4a7f1b3b8b4e6c7e8f9e0d1c2b3a4f5",
};

// Minimal ABIs for parsing different proxy events
const proxyInterfaces = {
  upgradeable: new ethers.Interface(["event Upgraded(address indexed implementation)"]),
  diamond: new ethers.Interface(["event DiamondCut(tuple(address facetAddress, uint8 action, bytes4[] functionSelectors)[] _diamondCut, address _init, bytes _calldata)"]),
  beacon: new ethers.Interface(["event BeaconUpgraded(address indexed beacon)"]),
};

// Performance tracking
let processingStats = {
  totalProcessed: 0,
  successfulProcessed: 0,
  errors: 0,
  startTime: Date.now(),
};

/**
 * Enhanced proxy upgrade log processor with comprehensive debugging and multiple proxy pattern support
 * @param {object} log - The log object from the provider
 * @param {object} [existingClient=null] - Optional existing database client
 * @param {object} [options={}] - Processing options
 */
export async function processProxyUpgradeLog(log, existingClient = null, options = {}) {
  const startTime = Date.now();
  const logId = `${log.transactionHash}-${log.logIndex || 0}`;

  processingStats.totalProcessed++;

  try {
    console.log(`🔍 [PROXY-DEBUG] Processing log ${logId}`);
    console.log(`    📍 Contract: ${log.address}`);
    console.log(`    📦 Block: ${log.blockNumber}`);
    console.log(`    🔗 Tx: ${log.transactionHash}`);
    console.log(`    📋 Topics: ${log.topics.length} topics`);

    // Validate log structure
    if (!log.topics || log.topics.length === 0) {
      console.warn(`⚠️  [PROXY-WARN] Log ${logId} has no topics, skipping`);
      return { success: false, reason: "no_topics" };
    }

    // Check if this matches any known proxy event signature
    const eventTopic = log.topics[0];
    const proxyType = detectProxyType(eventTopic);

    if (!proxyType) {
      console.log(`ℹ️  [PROXY-INFO] Log ${logId} is not a recognized proxy event, skipping`);
      return { success: false, reason: "not_proxy_event" };
    }

    console.log(`✅ [PROXY-SUCCESS] Detected ${proxyType} proxy event at ${log.address}`);

    const client = existingClient || (await getDbPool().connect());
    let ownTransaction = !existingClient;

    try {
      if (ownTransaction) {
        await client.query("BEGIN");
        console.log(`📊 [PROXY-DB] Started transaction for ${logId}`);
      }

      // Check if we already processed this log
      const existingRecord = await client.query("SELECT id FROM proxy_upgrades WHERE transaction_hash = $1 AND log_index = $2", [log.transactionHash, log.logIndex || 0]);

      if (existingRecord.rowCount > 0) {
        console.log(`⏭️  [PROXY-SKIP] Log ${logId} already processed, skipping`);
        if (ownTransaction) await client.query("ROLLBACK");
        return { success: true, reason: "already_processed" };
      }

      // Process based on proxy type
      let processingResult;
      switch (proxyType) {
        case "upgradeable":
          processingResult = await processUpgradeableProxy(log, client, logId);
          break;
        case "diamond":
          processingResult = await processDiamondProxy(log, client, logId);
          break;
        case "beacon":
          processingResult = await processBeaconProxy(log, client, logId);
          break;
        default:
          throw new Error(`Unsupported proxy type: ${proxyType}`);
      }

      if (!processingResult.success) {
        throw new Error(processingResult.error);
      }

      // Record the upgrade event with metadata
      await recordProxyUpgrade(client, {
        transactionHash: log.transactionHash,
        logIndex: log.logIndex || 0,
        blockNumber: log.blockNumber,
        proxyAddress: log.address,
        proxyType,
        upgradeData: processingResult.data,
        processedAt: new Date(),
      });

      if (ownTransaction) {
        await client.query("COMMIT");
        console.log(`💾 [PROXY-DB] Transaction committed for ${logId}`);
      }

      const processingTime = Date.now() - startTime;
      processingStats.successfulProcessed++;

      console.log(`🎉 [PROXY-SUCCESS] Successfully processed ${proxyType} proxy upgrade in ${processingTime}ms`);
      console.log(`    🔗 Proxy: ${log.address}`);
      console.log(`    ⬆️  Implementation: ${processingResult.data.newImplementation || "N/A"}`);

      return {
        success: true,
        proxyType,
        data: processingResult.data,
        processingTime,
      };
    } catch (dbError) {
      if (ownTransaction) {
        await client.query("ROLLBACK");
        console.log(`🔄 [PROXY-DB] Transaction rolled back for ${logId}`);
      }
      throw dbError;
    } finally {
      if (ownTransaction) {
        client.release();
        console.log(`🔌 [PROXY-DB] Database connection released for ${logId}`);
      }
    }
  } catch (error) {
    processingStats.errors++;
    const processingTime = Date.now() - startTime;

    console.error(`💥 [PROXY-ERROR] Failed to process log ${logId} in ${processingTime}ms:`);
    console.error(`    📍 Contract: ${log.address}`);
    console.error(`    🔗 Tx: ${log.transactionHash}`);
    console.error(`    ❌ Error: ${error.message}`);
    console.error(`    📚 Stack: ${error.stack}`);

    // Re-throw if using external transaction so parent can handle
    if (existingClient) {
      throw error;
    }

    return {
      success: false,
      error: error.message,
      processingTime,
    };
  }
}

/**
 * Detect proxy type based on event topic
 */
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

/**
 * Process OpenZeppelin Upgradeable Proxy events
 */
async function processUpgradeableProxy(log, client, logId) {
  try {
    console.log(`🔧 [PROXY-UPGRADEABLE] Processing upgradeable proxy for ${logId}`);

    const parsedLog = proxyInterfaces.upgradeable.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse Upgraded event");
    }

    const { implementation } = parsedLog.args;

    // Validate implementation address
    if (!ethers.isAddress(implementation)) {
      throw new Error(`Invalid implementation address: ${implementation}`);
    }

    // Check if implementation is a contract (has code)
    // Note: This would require a provider - you might want to pass it as parameter

    console.log(`📋 [PROXY-UPGRADEABLE] Parsed implementation: ${implementation}`);

    // Update the proxy-implementation mapping
    await updateProxyImplementation(client, log.address, implementation);

    return {
      success: true,
      data: {
        newImplementation: implementation,
        previousImplementation: await getPreviousImplementation(client, log.address),
      },
    };
  } catch (error) {
    console.error(`💥 [PROXY-UPGRADEABLE] Error processing upgradeable proxy: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process Diamond Proxy (EIP-2535) events
 */
async function processDiamondProxy(log, client, logId) {
  try {
    console.log(`💎 [PROXY-DIAMOND] Processing diamond proxy for ${logId}`);

    const parsedLog = proxyInterfaces.diamond.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse DiamondCut event");
    }

    // Diamond cuts are more complex - they can add/replace/remove facets
    const { _diamondCut, _init, _calldata } = parsedLog.args;

    console.log(`💎 [PROXY-DIAMOND] Diamond cut with ${_diamondCut.length} facet operations`);

    // Process each facet operation
    const facetOperations = [];
    for (let i = 0; i < _diamondCut.length; i++) {
      const cut = _diamondCut[i];
      const operation = {
        facetAddress: cut.facetAddress,
        action: cut.action, // 0=Add, 1=Replace, 2=Remove
        functionSelectors: cut.functionSelectors,
      };
      facetOperations.push(operation);

      console.log(`💎 [PROXY-DIAMOND] Facet ${i}: ${operation.facetAddress} (action: ${operation.action})`);
    }

    // Store diamond cut information
    await storeDiamondCut(client, log.address, {
      facetOperations,
      initContract: _init,
      initCalldata: _calldata,
    });

    return {
      success: true,
      data: {
        facetOperations,
        initContract: _init,
        initCalldata: _calldata,
      },
    };
  } catch (error) {
    console.error(`💥 [PROXY-DIAMOND] Error processing diamond proxy: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process Beacon Proxy events
 */
async function processBeaconProxy(log, client, logId) {
  try {
    console.log(`🚨 [PROXY-BEACON] Processing beacon proxy for ${logId}`);

    const parsedLog = proxyInterfaces.beacon.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse BeaconUpgraded event");
    }

    const { beacon } = parsedLog.args;

    if (!ethers.isAddress(beacon)) {
      throw new Error(`Invalid beacon address: ${beacon}`);
    }

    console.log(`🚨 [PROXY-BEACON] New beacon: ${beacon}`);

    // Store beacon proxy information
    await updateBeaconProxy(client, log.address, beacon);

    return {
      success: true,
      data: {
        newBeacon: beacon,
        previousBeacon: await getPreviousBeacon(client, log.address),
      },
    };
  } catch (error) {
    console.error(`💥 [PROXY-BEACON] Error processing beacon proxy: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get processing statistics
 */
export function getProcessingStats() {
  const uptime = Date.now() - processingStats.startTime;
  return {
    ...processingStats,
    uptime,
    successRate: processingStats.totalProcessed > 0 ? ((processingStats.successfulProcessed / processingStats.totalProcessed) * 100).toFixed(2) + "%" : "0%",
  };
}

/**
 * Reset processing statistics
 */
export function resetProcessingStats() {
  processingStats = {
    totalProcessed: 0,
    successfulProcessed: 0,
    errors: 0,
    startTime: Date.now(),
  };
}

// Helper functions - these would need to be implemented based on your database schema
async function getPreviousImplementation(client, proxyAddress) {
  // Implementation depends on your database schema
  return null;
}

async function getPreviousBeacon(client, proxyAddress) {
  // Implementation depends on your database schema
  return null;
}

async function recordProxyUpgrade(client, upgradeData) {
  // Implementation depends on your database schema
  console.log(`📝 [PROXY-DB] Recording proxy upgrade:`, upgradeData);
}

async function storeDiamondCut(client, proxyAddress, cutData) {
  // Implementation depends on your database schema
  console.log(`💎 [PROXY-DB] Storing diamond cut for ${proxyAddress}:`, cutData);
}

async function updateBeaconProxy(client, proxyAddress, beacon) {
  // Implementation depends on your database schema
  console.log(`🚨 [PROXY-DB] Updating beacon proxy ${proxyAddress} -> ${beacon}`);
}

export default {
  processProxyUpgradeLog,
  getProcessingStats,
  resetProcessingStats,
  PROXY_EVENT_SIGNATURES,
};
