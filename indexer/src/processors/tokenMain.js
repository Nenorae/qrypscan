// File: indexer/src/processors/tokenMain.js

import { getDbPool } from "../db/connect.js";
import { getOrFetchTokenMetadata } from "./tokenMetadata.js";
import { processingStats } from "./tokenStats.js";
import { TOKEN_EVENT_SIGNATURES, tokenInterfaces } from "./tokenConstants.js";
import { processERC20Transfer, processERC721Transfer, processERC1155Transfer } from "./tokenTransfers.js";
import { detectTokenStandard } from "./tokenUtils.js";

/**
 * Enhanced token log processor with comprehensive debugging and multi-standard support
 * @param {object} log - The log object from the provider
 * @param {number} blockTimestamp - The timestamp of the block containing the log
 * @param {object} provider - The Ethers provider instance
 * @param {object} [existingClient=null] - Optional existing database client
 * @param {object} [options={}] - Processing options
 */
export async function processTransactionLog(log, blockTimestamp, provider, existingClient = null, options = {}) {
  const startTime = Date.now();
  const logId = `${log.transactionHash}-${log.logIndex || 0}`;

  processingStats.totalLogs++;

  try {
    console.log(`🔍 [TOKEN-MAIN] Memulai pemrosesan log ${logId}`);
    console.log(`    - Kontrak: ${log.address}`);
    console.log(`    - Blok: ${log.blockNumber} (${new Date(blockTimestamp * 1000).toISOString()})`);
    console.log(`    - Tx: ${log.transactionHash}`);
    console.log(`    - Topik: ${log.topics?.length || 0} topik`);

    // Validate log structure
    if (!log.topics || log.topics.length === 0) {
      console.warn(`⚠️  [TOKEN-WARN] Log ${logId} tidak memiliki topik, dilewati`);
      return { success: false, reason: "no_topics" };
    }

    // Detect token standard based on event signature and topic structure
    const tokenStandard = detectTokenStandard(log);

    if (!tokenStandard) {
      console.log(`ℹ️  [TOKEN-INFO] Log ${logId} bukan event token yang dikenali, dilewati`);
      return { success: false, reason: "not_token_event" };
    }

    console.log(`✅ [TOKEN-DETECT] Terdeteksi event ${tokenStandard} di ${log.address}`);

    const client = existingClient || (await getDbPool().connect());
    let ownTransaction = !existingClient;

    try {
      if (ownTransaction) {
        await client.query("BEGIN");
        console.log(`[TOKEN-DB] Memulai transaksi untuk ${logId}`);
      }

      // Check if we already processed this log
      const existingRecord = await client.query("SELECT 1 FROM token_transfers WHERE tx_hash = $1 AND log_index = $2 LIMIT 1", [log.transactionHash, log.logIndex || 0]);

      if (existingRecord.rowCount > 0) {
        console.log(`⏭️  [TOKEN-SKIP] Log ${logId} sudah diproses, dilewati`);
        if (ownTransaction) await client.query("ROLLBACK");
        return { success: true, reason: "already_processed" };
      }

      // Get or fetch token metadata
      console.log(`[TOKEN-MAIN] Mendapatkan metadata untuk token ${log.address}`);
      const tokenInfo = await getOrFetchTokenMetadata(log.address, provider, client, tokenStandard);

      if (!tokenInfo) {
        console.warn(`⚠️  [TOKEN-WARN] Tidak bisa mendapatkan metadata token untuk ${log.address}, pemrosesan transfer dilewati`);
        if (ownTransaction) await client.query("ROLLBACK");
        return { success: false, reason: "no_token_metadata" };
      }

      processingStats.tokensProcessed++;

      // Process transfer based on token standard
      let transferResult;
      console.log(`[TOKEN-MAIN] Memproses transfer ${tokenStandard}`);
      switch (tokenStandard) {
        case "ERC20":
          transferResult = await processERC20Transfer(log, blockTimestamp, tokenInfo, client, logId);
          break;
        case "ERC721":
          transferResult = await processERC721Transfer(log, blockTimestamp, tokenInfo, client, logId, provider);
          break;
        case "ERC1155":
          transferResult = await processERC1155Transfer(log, blockTimestamp, tokenInfo, client, logId);
          break;
        default:
          throw new Error(`Unsupported token standard: ${tokenStandard}`);
      }

      if (!transferResult.success) {
        throw new Error(transferResult.error);
      }

      processingStats.transfersProcessed++;

      if (ownTransaction) {
        await client.query("COMMIT");
        console.log(`[TOKEN-DB] Transaksi di-commit untuk ${logId}`);
      }

      const processingTime = Date.now() - startTime;

      console.log(`🎉 [TOKEN-SUCCESS] Berhasil memproses transfer ${tokenStandard} dalam ${processingTime}ms`);
      console.log(`    - Token: ${tokenInfo.symbol} (${tokenInfo.name})`);
      console.log(`    - Jumlah: ${transferResult.humanReadableAmount || "N/A"}`);
      console.log(`    - Dari: ${transferResult.from}`);
      console.log(`    - Ke: ${transferResult.to}`);

      return {
        success: true,
        tokenStandard,
        tokenInfo,
        transferData: transferResult,
        processingTime,
      };
    } catch (dbError) {
      if (ownTransaction) {
        await client.query("ROLLBACK");
        console.error(`[TOKEN-DB] Transaksi di-rollback untuk ${logId} karena: ${dbError.message}`);
      }
      throw dbError;
    } finally {
      if (ownTransaction) {
        client.release();
        console.log(`[TOKEN-DB] Koneksi database dilepaskan untuk ${logId}`);
      }
    }
  } catch (error) {
    processingStats.errors++;
    const processingTime = Date.now() - startTime;

    console.error(`💥 [TOKEN-ERROR] Gagal memproses log ${logId} dalam ${processingTime}ms:`);
    console.error(`    - Kontrak: ${log.address}`);
    console.error(`    - Tx: ${log.transactionHash}`);
    console.error(`    - Error: ${error.message}`);
    console.error(`    - Stack: ${error.stack}`);

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
 * Process approval events (for better DeFi tracking)
 */
export async function processApprovalLog(log, blockTimestamp, provider, existingClient = null) {
  if (log.topics[0] !== TOKEN_EVENT_SIGNATURES.APPROVAL) {
    return { success: false, reason: "not_approval_event" };
  }

  const logId = `${log.transactionHash}-${log.logIndex || 0}`;
  try {
    console.log(`[TOKEN-APPROVAL] Memproses event approval: ${logId}`);

    const parsedLog = tokenInterfaces.erc20.parseLog(log);
    if (!parsedLog) {
      throw new Error("Gagal mem-parse event Approval");
    }

    const { owner, spender, value } = parsedLog.args;

    console.log(`[TOKEN-APPROVAL] Detail approval:`);
    console.log(`    - Owner: ${owner}`);
    console.log(`    - Spender: ${spender}`);
    console.log(`    - Value: ${value.toString()}`);

    // You can save approval data to track DeFi interactions
    // await saveTokenApproval(client, approvalData);

    return {
      success: true,
      owner,
      spender,
      value: value.toString(),
    };
  } catch (error) {
    console.error(`💥 [TOKEN-APPROVAL] Error memproses approval ${logId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}
