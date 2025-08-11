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
 * Enhanced proxy upgrade log processor with comprehensive debugging and multiple proxy pattern support
 * @param {object} log - The log object from the provider
 * @param {number} blockTimestamp - The timestamp of the block.
 * @param {ethers.Provider} provider - The Ethers provider.
 * @param {object} [existingClient=null] - Optional existing database client
 */
export async function processProxyUpgradeLog(log, blockTimestamp, provider, existingClient = null) {
  const startTime = Date.now();
  const logId = `${log.transactionHash}-${log.logIndex || 0}`;
  console.log(`[PROXY-MAIN] Memulai pemrosesan untuk log ${logId}`);

  processingStats.totalProcessed++;

  try {
    // Validate log structure
    if (!log.topics || log.topics.length === 0) {
      console.warn(`⚠️  [PROXY-WARN] Log ${logId} tidak memiliki topik, dilewati`);
      return { success: false, reason: "no_topics" };
    }

    const eventTopic = log.topics[0];
    const proxyType = detectProxyType(eventTopic);

    if (!proxyType) {
      // This is not a recognized proxy upgrade event, so we just ignore it.
      console.log(`[PROXY-MAIN] Log ${logId} bukan event upgrade proxy yang dikenali (topik: ${eventTopic}), dilewati.`);
      return { success: false, reason: "not_proxy_event" };
    }

    console.log(`✅ [PROXY-DETECT] Terdeteksi event proxy ${proxyType} di ${log.address} (tx: ${log.transactionHash})`);

    const client = existingClient || (await getDbPool().connect());
    let ownTransaction = !existingClient;
    try {
      if (ownTransaction) {
        console.log(`[PROXY-DB] Memulai transaksi untuk ${logId}`);
        await client.query("BEGIN");
      }

      // Check if we already processed this log to prevent duplicates
      const existingRecord = await client.query("SELECT 1 FROM proxy_upgrades WHERE tx_hash = $1 AND log_index = $2 LIMIT 1", [log.transactionHash, log.logIndex || 0]);
      if (existingRecord.rowCount > 0) {
        console.log(`⏭️  [PROXY-SKIP] Log ${logId} sudah diproses, dilewati`);
        if (ownTransaction) await client.query("ROLLBACK");
        return { success: true, reason: "already_processed" };
      }

      // Process based on proxy type
      let processingResult;
      console.log(`[PROXY-MAIN] Memproses log sebagai tipe ${proxyType}`);
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

      if (ownTransaction) {
        await client.query("COMMIT");
        console.log(`[PROXY-DB] Transaksi di-commit untuk ${logId}`);
      }

      const processingTime = Date.now() - startTime;
      processingStats.successfulProcessed++;
      console.log(`🎉 [PROXY-SUCCESS] Berhasil memproses upgrade proxy ${proxyType} dalam ${processingTime}ms untuk ${log.address}`);

      return {
        success: true,
        proxyType,
        data: processingResult.data,
        processingTime,
      };
    } catch (dbError) {
      if (ownTransaction) {
        await client.query("ROLLBACK");
        console.error(`[PROXY-DB] Transaksi di-rollback untuk ${logId} karena error: ${dbError.message}`);
      }
      throw dbError; // Re-throw to be caught by the outer catch block
    } finally {
      if (ownTransaction) {
        client.release();
        console.log(`[PROXY-DB] Koneksi database dilepaskan untuk ${logId}`);
      }
    }
  } catch (error) {
    processingStats.errors++;
    const processingTime = Date.now() - startTime;
    console.error(`💥 [PROXY-ERROR] Gagal memproses log ${logId} dalam ${processingTime}ms: ${error.message}`);
    console.error(`    Stack: ${error.stack}`);
    if (existingClient) throw error; // Re-throw if using an external transaction
    return { success: false, error: error.message, processingTime };
  }
}

function detectProxyType(eventTopic) {
  console.log(`[PROXY-DEBUG] Mendeteksi tipe proxy dari topik event: ${eventTopic}`);
  switch (eventTopic) {
    case PROXY_EVENT_SIGNATURES.UPGRADED:
      console.log(`[PROXY-DEBUG] Topik cocok dengan UPGRADED (upgradeable)`);
      return "upgradeable";
    case PROXY_EVENT_SIGNATURES.DIAMOND_CUT:
      console.log(`[PROXY-DEBUG] Topik cocok dengan DIAMOND_CUT (diamond)`);
      return "diamond";
    case PROXY_EVENT_SIGNATURES.BEACON_UPGRADED:
      console.log(`[PROXY-DEBUG] Topik cocok dengan BEACON_UPGRADED (beacon)`);
      return "beacon";
    default:
      console.log(`[PROXY-DEBUG] Topik tidak cocok dengan event proxy yang dikenali`);
      return null;
  }
}

async function processUpgradeableProxy(log, blockTimestamp, client) {
  console.log(`[PROXY-UPGRADEABLE] Memproses event Upgraded untuk ${log.address}`);
  const parsedLog = proxyInterfaces.upgradeable.parseLog(log);
  if (!parsedLog) throw new Error("Gagal mem-parse event Upgraded");

  const { implementation } = parsedLog.args;
  console.log(`[PROXY-UPGRADEABLE] Alamat implementasi baru: ${implementation}`);
  if (!ethers.isAddress(implementation)) throw new Error(`Alamat implementasi tidak valid: ${implementation}`);

  // 1. Update the current state in the `contracts` table
  console.log(`[PROXY-UPGRADEABLE] Memperbarui implementasi proxy di tabel kontrak`);
  await updateContractProxyImplementation(client, log.address, implementation);

  // 2. Record the historical upgrade event
  console.log(`[PROXY-UPGRADEABLE] Merekam histori upgrade`);
  await recordProxyUpgrade(client, {
    proxyAddress: log.address,
    implementationAddress: implementation,
    proxyType: 'Upgradeable',
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    blockTimestamp: new Date(blockTimestamp * 1000),
  });

  console.log(`[PROXY-UPGRADEABLE] Berhasil diproses untuk ${log.address}`);
  return { success: true, data: { newImplementation: implementation } };
}

async function processDiamondProxy(log, blockTimestamp, client) {
  console.log(`[PROXY-DIAMOND] Memproses event DiamondCut untuk ${log.address}`);
  const parsedLog = proxyInterfaces.diamond.parseLog(log);
  if (!parsedLog) throw new Error("Gagal mem-parse event DiamondCut");

  const { _diamondCut } = parsedLog.args;
  const blockTime = new Date(blockTimestamp * 1000);
  console.log(`[PROXY-DIAMOND] Ditemukan ${_diamondCut.length} operasi facet`);

  for (const [index, cut] of _diamondCut.entries()) {
    console.log(`[PROXY-DIAMOND] Memproses cut ${index + 1}/${_diamondCut.length}: Aksi=${cut.action}, Facet=${cut.facetAddress}`);
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

  console.log(`[PROXY-DIAMOND] Berhasil diproses untuk ${log.address}`);
  return { success: true, data: { facetOperations: _diamondCut.length } };
}

async function processBeaconProxy(log, blockTimestamp, client, provider) {
  console.log(`[PROXY-BEACON] Memproses event BeaconUpgraded untuk ${log.address}`);
  const parsedLog = proxyInterfaces.beacon.parseLog(log);
  if (!parsedLog) throw new Error("Gagal mem-parse event BeaconUpgraded");

  const { beacon } = parsedLog.args;
  console.log(`[PROXY-BEACON] Alamat beacon: ${beacon}`);
  if (!ethers.isAddress(beacon)) throw new Error(`Alamat beacon tidak valid: ${beacon}`);

  // A beacon upgrade points to the beacon, not the implementation.
  // We need to call the beacon contract to find the actual implementation address.
  console.log(`[PROXY-BEACON] Mengambil implementasi dari kontrak beacon ${beacon}`);
  const beaconContract = new ethers.Contract(beacon, beaconAbi, provider);
  const implementation = await beaconContract.implementation();
  console.log(`[PROXY-BEACON] Alamat implementasi yang ditemukan: ${implementation}`);
  if (!ethers.isAddress(implementation)) throw new Error(`Beacon di ${beacon} mengembalikan alamat implementasi yang tidak valid: ${implementation}`);

  // 1. Update the proxy's current implementation in the `contracts` table
  console.log(`[PROXY-BEACON] Memperbarui implementasi proxy di tabel kontrak`);
  await updateContractProxyImplementation(client, log.address, implementation);
  
  // 2. Store the relationship between this proxy and its beacon
  console.log(`[PROXY-BEACON] Memperbarui info beacon untuk proxy`);
  await updateBeaconProxyInfo(client, log.address, beacon);

  // 3. Record the historical upgrade event
  console.log(`[PROXY-BEACON] Merekam histori upgrade`);
  await recordProxyUpgrade(client, {
    proxyAddress: log.address,
    implementationAddress: implementation,
    proxyType: 'Beacon',
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    blockTimestamp: new Date(blockTimestamp * 1000),
  });

  console.log(`[PROXY-BEACON] Berhasil diproses untuk ${log.address}`);
  return { success: true, data: { newImplementation: implementation, beaconAddress: beacon } };
}
