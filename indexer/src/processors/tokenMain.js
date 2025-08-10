// File: indexer/src/processors/tokenMain.js

import { getDbPool } from "../db/connect.js";
import { checkProxyStatus } from "../proxyProcessor.js";
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
    console.log(`🔍 [TOKEN-DEBUG] Processing log ${logId}`);
    console.log(`    📍 Contract: ${log.address}`);
    console.log(`    📦 Block: ${log.blockNumber} (${new Date(blockTimestamp * 1000).toISOString()})`);
    console.log(`    🔗 Tx: ${log.transactionHash}`);
    console.log(`    📋 Topics: ${log.topics?.length || 0} topics`);

    // Validate log structure
    if (!log.topics || log.topics.length === 0) {
      console.warn(`⚠️  [TOKEN-WARN] Log ${logId} has no topics, skipping`);
      return { success: false, reason: "no_topics" };
    }

    // Detect token standard based on event signature and topic structure
    const tokenStandard = detectTokenStandard(log);

    if (!tokenStandard) {
      console.log(`ℹ️  [TOKEN-INFO] Log ${logId} is not a recognized token event, skipping`);
      return { success: false, reason: "not_token_event" };
    }

    console.log(`✅ [TOKEN-SUCCESS] Detected ${tokenStandard} event at ${log.address}`);

    const client = existingClient || (await getDbPool().connect());
    let ownTransaction = !existingClient;

    try {
      if (ownTransaction) {
        await client.query("BEGIN");
        console.log(`📊 [TOKEN-DB] Started transaction for ${logId}`);
      }

      // Check if we already processed this log
      const existingRecord = await client.query("SELECT 1 FROM token_transfers WHERE tx_hash = $1 AND log_index = $2 LIMIT 1", [log.transactionHash, log.logIndex || 0]);

      if (existingRecord.rowCount > 0) {
        console.log(`⏭️  [TOKEN-SKIP] Log ${logId} already processed, skipping`);
        if (ownTransaction) await client.query("ROLLBACK");
        return { success: true, reason: "already_processed" };
      }

      // Get or fetch token metadata
      const tokenInfo = await getOrFetchTokenMetadata(log.address, provider, client, tokenStandard);

      if (!tokenInfo) {
        console.warn(`⚠️  [TOKEN-WARN] Could not get token metadata for ${log.address}, skipping transfer processing`);
        if (ownTransaction) await client.query("ROLLBACK");
        return { success: false, reason: "no_token_metadata" };
      }

      processingStats.tokensProcessed++;

      // Process transfer based on token standard
      let transferResult;
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
        console.log(`💾 [TOKEN-DB] Transaction committed for ${logId}`);
      }

      const processingTime = Date.now() - startTime;

      console.log(`🎉 [TOKEN-SUCCESS] Successfully processed ${tokenStandard} transfer in ${processingTime}ms`);
      console.log(`    🪙 Token: ${tokenInfo.symbol} (${tokenInfo.name})`);
      console.log(`    📊 Amount: ${transferResult.humanReadableAmount || "N/A"}`);
      console.log(`    👤 From: ${transferResult.from}`);
      console.log(`    👤 To: ${transferResult.to}`);

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
        console.log(`🔄 [TOKEN-DB] Transaction rolled back for ${logId}`);
      }
      throw dbError;
    } finally {
      if (ownTransaction) {
        client.release();
        console.log(`🔌 [TOKEN-DB] Database connection released for ${logId}`);
      }
    }
  } catch (error) {
    processingStats.errors++;
    const processingTime = Date.now() - startTime;

    console.error(`💥 [TOKEN-ERROR] Failed to process log ${logId} in ${processingTime}ms:`);
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
 * Detect if contract might be a proxy by checking for proxy patterns
 */
export async function detectProxyPattern(contractAddress, provider) {
  console.log(`🔍 [TOKEN-PROXY] Checking proxy patterns for ${contractAddress}`);
  const proxyStatus = await checkProxyStatus(contractAddress, provider);
  if (proxyStatus.is_proxy) {
    console.log(`✅ [TOKEN-PROXY] Detected EIP-1967 proxy pattern in ${contractAddress}`);
    return {
        isProxy: true,
        proxyType: "eip1967",
        implementation: proxyStatus.implementation_address,
        confidence: "high",
    };
  }

  console.log(`ℹ️  [TOKEN-PROXY] No EIP-1967 proxy patterns detected for ${contractAddress}`);
  return { isProxy: false, reason: "no_patterns_found" };
}

/**
 * Process approval events (for better DeFi tracking)
 */
export async function processApprovalLog(log, blockTimestamp, provider, existingClient = null) {
  if (log.topics[0] !== TOKEN_EVENT_SIGNATURES.APPROVAL) {
    return { success: false, reason: "not_approval_event" };
  }

  try {
    console.log(`👥 [TOKEN-APPROVAL] Processing approval event: ${log.transactionHash}`);

    const parsedLog = tokenInterfaces.erc20.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse Approval event");
    }

    const { owner, spender, value } = parsedLog.args;

    console.log(`👥 [TOKEN-APPROVAL] Approval details:`);
    console.log(`    Owner: ${owner}`);
    console.log(`    Spender: ${spender}`);
    console.log(`    Value: ${value.toString()}`);

    // You can save approval data to track DeFi interactions
    // await saveTokenApproval(client, approvalData);

    return {
      success: true,
      owner,
      spender,
      value: value.toString(),
    };
  } catch (error) {
    console.error(`💥 [TOKEN-APPROVAL] Error processing approval: ${error.message}`);
    return { success: false, error: error.message };
  }
}
