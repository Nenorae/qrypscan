// File: indexer/src/processors/proxyMain.js

import { ethers } from "ethers";
import { getDbPool } from "../db/connect.js";
import { 
  updateContractProxyImplementation,
  recordProxyUpgrade,
  storeDiamondCut,
  updateBeaconProxyInfo
} from "../db/queries/index.js";
import { PROXY_EVENT_SIGNATURES, proxyInterfaces } from "./proxyConstants.js";
import { processingStats } from "./proxyStats.js";
import { ProxyAdminTransactionDecoder } from './proxyDecoder.js';

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
          processingResult = await processUpgradeableProxy(log, blockTimestamp, client, provider);
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

async function processUpgradeableProxy(log, blockTimestamp, client, provider) {
  console.log(`[PROXY-UPGRADEABLE] Memproses event Upgraded dari tx: ${log.transactionHash}`);
  const parsedLog = proxyInterfaces.upgradeable.parseLog(log);
  if (!parsedLog) throw new Error("Gagal mem-parse event Upgraded");

  const { implementation: newImplementation } = parsedLog.args;
  console.log(`[PROXY-UPGRADEABLE] Alamat implementasi baru dari event: ${newImplementation}`);
  if (!ethers.isAddress(newImplementation)) throw new Error(`Alamat implementasi tidak valid: ${newImplementation}`);

  let proxyAddress = log.address; // Default to log address (for UUPS)
  let upgradeType = 'UUPS';

  // Coba decode transaksi untuk menemukan proxy address jika event berasal dari ProxyAdmin
  console.log(`[PROXY-UPGRADEABLE] Mencoba mendekode transaksi untuk menemukan alamat proxy yang sebenarnya...`);
  try {
    const decoder = new ProxyAdminTransactionDecoder(provider);
    const decodedTx = await decoder.decodeUpgradeTransaction(log.transactionHash);
    
    console.log('[PROXY-DECODE] Hasil dekode transaksi lengkap:', decodedTx);

    if (decodedTx && decodedTx.proxyAddress && ethers.isAddress(decodedTx.proxyAddress)) {
        // Jika berhasil di-decode dan ada proxyAddress, berarti ini dari ProxyAdmin
        proxyAddress = decodedTx.proxyAddress;
        upgradeType = `Transparent (${decodedTx.functionName})`;
        console.log(`[PROXY-DECODE] SUKSES: Ditemukan alamat proxy via dekode transaksi: ${proxyAddress}`);
    } else {
        console.log(`[PROXY-DECODE] INFO: Dekoder tidak menemukan alamat proxy. Mengasumsikan pola UUPS dimana event emitter adalah proxy: ${proxyAddress}`);
        if(decodedTx.error) {
            console.log(`[PROXY-DECODE] Alasan dari dekoder: ${decodedTx.error}`);
        }
    }
  } catch (e) {
      console.warn(`[PROXY-DECODE] GAGAL: Terjadi error saat dekode transaksi. Kembali ke pola UUPS. Error: ${e.message}`);
  }

  // 1. Update the current state in the `contracts` table
  console.log(`[PROXY-UPGRADEABLE] Memperbarui implementasi untuk proxy ${proxyAddress} ke ${newImplementation}`);
  await updateContractProxyImplementation(client, proxyAddress, newImplementation);

  // 2. Record the historical upgrade event
  console.log(`[PROXY-UPGRADEABLE] Merekam histori upgrade untuk proxy ${proxyAddress}`);
  await recordProxyUpgrade(client, {
    proxyAddress: proxyAddress,
    implementationAddress: newImplementation,
    proxyType: upgradeType,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    blockTimestamp: new Date(blockTimestamp * 1000),
  });

  console.log(`[PROXY-UPGRADEABLE] Berhasil diproses untuk proxy ${proxyAddress}`);
  return { success: true, data: { proxyAddress, newImplementation } };
}

/**
 * Scans a transaction to see if it's a direct proxy upgrade call without corresponding logs.
 * @param {object} tx - The transaction object from the provider
 * @param {number} blockTimestamp - The timestamp of the block.
 * @param {ethers.Provider} provider - The Ethers provider.
 * @param {object} client - The database client
 */
export async function processPossibleProxyUpgradeTransaction(tx, blockTimestamp, provider, client) {
  // We only care about transactions that are contract interactions with input data
  if (!tx.to || !tx.data || tx.data === '0x') {
    return { success: false, reason: 'not_contract_interaction' };
  }
  
  console.log(`[PROXY-TX-SCAN] Memindai transaksi ${tx.hash} untuk kemungkinan upgrade proxy...`);
  const decoder = new ProxyAdminTransactionDecoder(provider);
  const decodedTx = await decoder.decodeUpgradeTransaction(tx.hash);

  // Check if the decoder successfully found a proxy upgrade pattern
  if (decodedTx && decodedTx.proxyAddress && decodedTx.newImplementation) {
    console.log(`[PROXY-TX-SCAN] Ditemukan upgrade proxy via scan transaksi: ${decodedTx.proxyAddress} -> ${decodedTx.newImplementation}`);
    const upgradeType = `Transparent (${decodedTx.functionName})`;

    // 1. Update contract state
    await updateContractProxyImplementation(client, decodedTx.proxyAddress, decodedTx.newImplementation);

    // 2. Record historical upgrade
    await recordProxyUpgrade(client, {
      proxyAddress: decodedTx.proxyAddress,
      implementationAddress: decodedTx.newImplementation,
      proxyType: upgradeType,
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      blockTimestamp: new Date(blockTimestamp * 1000),
    });

    console.log(`[PROXY-TX-SCAN] Berhasil merekam upgrade dari scan transaksi untuk proxy ${decodedTx.proxyAddress}`);
    return { success: true, proxyAddress: decodedTx.proxyAddress };
  }

  return { success: false, reason: 'not_proxy_upgrade_transaction' };
}
