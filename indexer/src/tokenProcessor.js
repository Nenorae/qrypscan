// File: indexer/src/tokenProcessor.js

import { ethers } from "ethers";
import { erc20Abi } from "./utils/erc20Abi.js";
import { getDbPool } from "./db/connect.js";
import { saveTokenInfo, saveTokenTransfer } from "./db/queries.js";

// Event signatures untuk berbagai token standards
export const TOKEN_EVENT_SIGNATURES = {
  // ERC20 Transfer
  TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  // ERC20 Approval
  APPROVAL: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
  // ERC721 Transfer (same as ERC20 but different data structure)
  ERC721_TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  // ERC1155 TransferSingle
  ERC1155_TRANSFER_SINGLE: "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",
  // ERC1155 TransferBatch
  ERC1155_TRANSFER_BATCH: "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb",
};

// Enhanced interfaces for different token types
const tokenInterfaces = {
  erc20: new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
  ]),
  erc721: new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function totalSupply() view returns (uint256)",
  ]),
  erc1155: new ethers.Interface([
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  ]),
};

// Caching untuk metadata token
const tokenMetadataCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// Performance tracking
let processingStats = {
  totalLogs: 0,
  tokensProcessed: 0,
  transfersProcessed: 0,
  newTokensDiscovered: 0,
  cacheHits: 0,
  errors: 0,
  startTime: Date.now(),
};

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
      const existingRecord = await client.query("SELECT id FROM token_transfers WHERE transaction_hash = $1 AND log_index = $2", [log.transactionHash, log.logIndex || 0]);

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
          transferResult = await processERC721Transfer(log, blockTimestamp, tokenInfo, client, logId);
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
 * Detect token standard based on event signature and topic structure
 */
function detectTokenStandard(log) {
  const eventTopic = log.topics[0];

  switch (eventTopic) {
    case TOKEN_EVENT_SIGNATURES.TRANSFER:
      // Both ERC20 and ERC721 use the same Transfer signature
      // ERC20: Transfer(address,address,uint256) - 3 topics
      // ERC721: Transfer(address,address,uint256) - 4 topics (tokenId is indexed)
      return log.topics.length === 4 ? "ERC721" : "ERC20";

    case TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_SINGLE:
      return "ERC1155";

    case TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_BATCH:
      return "ERC1155";

    default:
      return null;
  }
}

/**
 * Get token metadata from cache or fetch from blockchain
 */
async function getOrFetchTokenMetadata(contractAddress, provider, client, tokenStandard) {
  try {
    // Check cache first
    const cacheKey = `${contractAddress}-${tokenStandard}`;
    const cached = tokenMetadataCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      processingStats.cacheHits++;
      console.log(`💾 [TOKEN-CACHE] Cache hit for ${contractAddress} (${tokenStandard})`);
      return cached.data;
    }

    // Check database
    const dbResult = await client.query("SELECT * FROM tokens WHERE contract_address = $1", [contractAddress]);

    if (dbResult.rowCount > 0) {
      const tokenInfo = dbResult.rows[0];
      console.log(`📁 [TOKEN-DB] Found existing token in database: ${tokenInfo.symbol}`);

      // Cache the result
      tokenMetadataCache.set(cacheKey, {
        data: tokenInfo,
        timestamp: Date.now(),
      });

      return tokenInfo;
    }

    // Fetch from blockchain
    console.log(`🌐 [TOKEN-FETCH] Fetching metadata for new ${tokenStandard} token: ${contractAddress}`);

    const tokenInfo = await fetchTokenMetadata(contractAddress, provider, tokenStandard);

    if (tokenInfo) {
      // Save to database
      await saveTokenInfo(client, tokenInfo);
      processingStats.newTokensDiscovered++;

      // Cache the result
      tokenMetadataCache.set(cacheKey, {
        data: tokenInfo,
        timestamp: Date.now(),
      });

      console.log(`✅ [TOKEN-NEW] New token discovered: ${tokenInfo.symbol} (${tokenInfo.name})`);
    }

    return tokenInfo;
  } catch (error) {
    console.error(`💥 [TOKEN-METADATA] Error getting token metadata for ${contractAddress}:`, error.message);
    return null;
  }
}

/**
 * Fetch token metadata from blockchain with retry logic
 */
async function fetchTokenMetadata(contractAddress, provider, tokenStandard, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [TOKEN-FETCH] Attempt ${attempt}/${maxRetries} for ${contractAddress}`);

      let tokenInfo = {
        contract_address: contractAddress,
        token_type: tokenStandard,
        created_at: new Date(),
      };

      if (tokenStandard === "ERC20" || tokenStandard === "ERC721") {
        const contract = new ethers.Contract(contractAddress, tokenStandard === "ERC20" ? erc20Abi : tokenInterfaces.erc721, provider);

        // Use Promise.allSettled to handle partial failures
        const results = await Promise.allSettled([contract.name(), contract.symbol(), tokenStandard === "ERC20" ? contract.decimals() : Promise.resolve(0), contract.totalSupply().catch(() => BigInt(0))]);

        tokenInfo.name = results[0].status === "fulfilled" ? results[0].value : `Unknown Token`;
        tokenInfo.symbol = results[1].status === "fulfilled" ? results[1].value : `UNK`;
        tokenInfo.decimals = results[2].status === "fulfilled" ? Number(results[2].value) : tokenStandard === "ERC20" ? 18 : 0;
        tokenInfo.total_supply = results[3].status === "fulfilled" ? results[3].value.toString() : "0";

        console.log(`📋 [TOKEN-FETCH] Metadata fetched: ${tokenInfo.symbol} (${tokenInfo.name})`);
        console.log(`    📊 Type: ${tokenStandard}, Decimals: ${tokenInfo.decimals}, Supply: ${tokenInfo.total_supply}`);
      } else if (tokenStandard === "ERC1155") {
        // ERC1155 tokens don't have standard metadata methods
        tokenInfo.name = "ERC1155 Token";
        tokenInfo.symbol = "ERC1155";
        tokenInfo.decimals = 0;
        tokenInfo.total_supply = "0";
      }

      return tokenInfo;
    } catch (error) {
      console.warn(`⚠️  [TOKEN-FETCH] Attempt ${attempt} failed for ${contractAddress}: ${error.message}`);

      if (attempt === maxRetries) {
        console.error(`💥 [TOKEN-FETCH] All attempts failed for ${contractAddress}`);
        // Return minimal info so we can still process transfers
        return {
          contract_address: contractAddress,
          name: "Unknown Token",
          symbol: "UNK",
          decimals: tokenStandard === "ERC20" ? 18 : 0,
          total_supply: "0",
          token_type: tokenStandard,
          created_at: new Date(),
          metadata_failed: true,
        };
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

/**
 * Process ERC20 Transfer event
 */
async function processERC20Transfer(log, blockTimestamp, tokenInfo, client, logId) {
  try {
    console.log(`🪙 [TOKEN-ERC20] Processing ERC20 transfer for ${logId}`);

    const parsedLog = tokenInterfaces.erc20.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse ERC20 Transfer event");
    }

    const { from, to, value } = parsedLog.args;

    // Validate addresses
    if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
      throw new Error(`Invalid addresses - from: ${from}, to: ${to}`);
    }

    // Calculate human-readable amount
    const decimals = tokenInfo.decimals || 18;
    const humanReadableAmount = ethers.formatUnits(value, decimals);

    console.log(`🪙 [TOKEN-ERC20] Transfer details:`);
    console.log(`    From: ${from}`);
    console.log(`    To: ${to}`);
    console.log(`    Amount: ${humanReadableAmount} ${tokenInfo.symbol}`);
    console.log(`    Raw Value: ${value.toString()}`);

    // Check for special transfer types
    const transferType = getTransferType(from, to);
    console.log(`    Type: ${transferType}`);

    const transferData = {
      transaction_hash: log.transactionHash,
      log_index: log.logIndex || 0,
      block_number: log.blockNumber,
      block_timestamp: new Date(blockTimestamp * 1000),
      contract_address: log.address,
      from_address: from,
      to_address: to,
      value: value.toString(),
      human_readable_amount: humanReadableAmount,
      transfer_type: transferType,
      token_type: "ERC20",
    };

    await saveTokenTransfer(client, transferData);

    return {
      success: true,
      from,
      to,
      value: value.toString(),
      humanReadableAmount,
      transferType,
    };
  } catch (error) {
    console.error(`💥 [TOKEN-ERC20] Error processing ERC20 transfer: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process ERC721 Transfer event
 */
async function processERC721Transfer(log, blockTimestamp, tokenInfo, client, logId) {
  try {
    console.log(`🖼️  [TOKEN-ERC721] Processing ERC721 transfer for ${logId}`);

    const parsedLog = tokenInterfaces.erc721.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse ERC721 Transfer event");
    }

    const { from, to, tokenId } = parsedLog.args;

    // Validate addresses
    if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
      throw new Error(`Invalid addresses - from: ${from}, to: ${to}`);
    }

    console.log(`🖼️  [TOKEN-ERC721] NFT Transfer details:`);
    console.log(`    From: ${from}`);
    console.log(`    To: ${to}`);
    console.log(`    Token ID: ${tokenId.toString()}`);

    // Check for special transfer types
    const transferType = getTransferType(from, to);
    console.log(`    Type: ${transferType}`);

    // Try to get token URI if possible (optional, might fail)
    let tokenUri = null;
    try {
      const contract = new ethers.Contract(log.address, tokenInterfaces.erc721, provider);
      tokenUri = await contract.tokenURI(tokenId);
      console.log(`    Token URI: ${tokenUri}`);
    } catch (uriError) {
      console.warn(`⚠️  [TOKEN-ERC721] Could not fetch tokenURI: ${uriError.message}`);
    }

    const transferData = {
      transaction_hash: log.transactionHash,
      log_index: log.logIndex || 0,
      block_number: log.blockNumber,
      block_timestamp: new Date(blockTimestamp * 1000),
      contract_address: log.address,
      from_address: from,
      to_address: to,
      token_id: tokenId.toString(),
      token_uri: tokenUri,
      transfer_type: transferType,
      token_type: "ERC721",
    };

    await saveTokenTransfer(client, transferData);

    return {
      success: true,
      from,
      to,
      tokenId: tokenId.toString(),
      tokenUri,
      transferType,
    };
  } catch (error) {
    console.error(`💥 [TOKEN-ERC721] Error processing ERC721 transfer: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process ERC1155 Transfer events (Single and Batch)
 */
async function processERC1155Transfer(log, blockTimestamp, tokenInfo, client, logId) {
  try {
    console.log(`🎭 [TOKEN-ERC1155] Processing ERC1155 transfer for ${logId}`);

    const eventTopic = log.topics[0];
    let parsedLog;
    let isBatch = false;

    if (eventTopic === TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_SINGLE) {
      parsedLog = tokenInterfaces.erc1155.parseLog(log);
      console.log(`🎭 [TOKEN-ERC1155] Single transfer detected`);
    } else if (eventTopic === TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_BATCH) {
      parsedLog = tokenInterfaces.erc1155.parseLog(log);
      isBatch = true;
      console.log(`🎭 [TOKEN-ERC1155] Batch transfer detected`);
    } else {
      throw new Error("Unknown ERC1155 transfer event");
    }

    if (!parsedLog) {
      throw new Error("Failed to parse ERC1155 Transfer event");
    }

    if (isBatch) {
      // Handle batch transfer
      const { operator, from, to, ids, values } = parsedLog.args;

      console.log(`🎭 [TOKEN-ERC1155] Batch transfer details:`);
      console.log(`    Operator: ${operator}`);
      console.log(`    From: ${from}`);
      console.log(`    To: ${to}`);
      console.log(`    Tokens: ${ids.length} different tokens`);

      const transferType = getTransferType(from, to);
      const transfers = [];

      for (let i = 0; i < ids.length; i++) {
        const tokenId = ids[i].toString();
        const value = values[i].toString();

        console.log(`    Token ${i + 1}: ID=${tokenId}, Value=${value}`);

        const transferData = {
          transaction_hash: log.transactionHash,
          log_index: log.logIndex || 0,
          batch_index: i,
          block_number: log.blockNumber,
          block_timestamp: new Date(blockTimestamp * 1000),
          contract_address: log.address,
          operator_address: operator,
          from_address: from,
          to_address: to,
          token_id: tokenId,
          value: value,
          transfer_type: transferType,
          token_type: "ERC1155",
          is_batch: true,
        };

        await saveTokenTransfer(client, transferData);
        transfers.push({ tokenId, value });
      }

      return {
        success: true,
        operator,
        from,
        to,
        transfers,
        transferType,
        isBatch: true,
      };
    } else {
      // Handle single transfer
      const { operator, from, to, id, value } = parsedLog.args;

      console.log(`🎭 [TOKEN-ERC1155] Single transfer details:`);
      console.log(`    Operator: ${operator}`);
      console.log(`    From: ${from}`);
      console.log(`    To: ${to}`);
      console.log(`    Token ID: ${id.toString()}`);
      console.log(`    Value: ${value.toString()}`);

      const transferType = getTransferType(from, to);

      const transferData = {
        transaction_hash: log.transactionHash,
        log_index: log.logIndex || 0,
        block_number: log.blockNumber,
        block_timestamp: new Date(blockTimestamp * 1000),
        contract_address: log.address,
        operator_address: operator,
        from_address: from,
        to_address: to,
        token_id: id.toString(),
        value: value.toString(),
        transfer_type: transferType,
        token_type: "ERC1155",
        is_batch: false,
      };

      await saveTokenTransfer(client, transferData);

      return {
        success: true,
        operator,
        from,
        to,
        tokenId: id.toString(),
        value: value.toString(),
        transferType,
        isBatch: false,
      };
    }
  } catch (error) {
    console.error(`💥 [TOKEN-ERC1155] Error processing ERC1155 transfer: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Determine transfer type based on from/to addresses
 */
function getTransferType(from, to) {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  if (from === ZERO_ADDRESS && to !== ZERO_ADDRESS) {
    return "mint";
  } else if (from !== ZERO_ADDRESS && to === ZERO_ADDRESS) {
    return "burn";
  } else if (from !== ZERO_ADDRESS && to !== ZERO_ADDRESS) {
    return "transfer";
  } else {
    return "unknown";
  }
}

/**
 * Detect if contract might be a proxy by checking for proxy patterns
 */
export async function detectProxyPattern(contractAddress, provider) {
  try {
    console.log(`🔍 [TOKEN-PROXY] Checking proxy patterns for ${contractAddress}`);

    // Get contract bytecode
    const code = await provider.getCode(contractAddress);

    if (code === "0x" || code.length < 10) {
      console.log(`⚠️  [TOKEN-PROXY] Contract ${contractAddress} has no code`);
      return { isProxy: false, reason: "no_code" };
    }

    // Check for common proxy patterns in bytecode
    const proxyPatterns = {
      // OpenZeppelin proxy patterns
      upgradeable: /363d3d373d3d3d363d73.{40}5af43d82803e903d91602b57fd5bf3/i,
      // Minimal proxy (EIP-1167)
      minimal: /363d3d373d3d3d363d30545af43d82803e903d91602857fd5bf3/i,
      // Diamond proxy
      diamond: /a2646970667358.*73/i,
    };

    for (const [patternName, pattern] of Object.entries(proxyPatterns)) {
      if (pattern.test(code)) {
        console.log(`✅ [TOKEN-PROXY] Detected ${patternName} proxy pattern in ${contractAddress}`);
        return {
          isProxy: true,
          proxyType: patternName,
          confidence: "high",
        };
      }
    }

    // Check for storage slots commonly used by proxies
    try {
      // OpenZeppelin implementation slot: keccak256("eip1967.proxy.implementation") - 1
      const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const implAddress = await provider.getStorage(contractAddress, implSlot);

      if (implAddress !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        console.log(`✅ [TOKEN-PROXY] Found implementation address in EIP-1967 slot: ${implAddress}`);
        return {
          isProxy: true,
          proxyType: "eip1967",
          implementation: implAddress,
          confidence: "high",
        };
      }
    } catch (storageError) {
      console.warn(`⚠️  [TOKEN-PROXY] Could not check storage slots: ${storageError.message}`);
    }

    console.log(`ℹ️  [TOKEN-PROXY] No proxy patterns detected for ${contractAddress}`);
    return { isProxy: false, reason: "no_patterns_found" };
  } catch (error) {
    console.error(`💥 [TOKEN-PROXY] Error checking proxy patterns: ${error.message}`);
    return { isProxy: false, error: error.message };
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
    cacheSize: tokenMetadataCache.size,
    successRate: processingStats.totalLogs > 0 ? ((processingStats.transfersProcessed / processingStats.totalLogs) * 100).toFixed(2) + "%" : "0%",
    cacheHitRate: processingStats.totalLogs > 0 ? ((processingStats.cacheHits / processingStats.totalLogs) * 100).toFixed(2) + "%" : "0%",
  };
}

/**
 * Reset processing statistics
 */
export function resetProcessingStats() {
  processingStats = {
    totalLogs: 0,
    tokensProcessed: 0,
    transfersProcessed: 0,
    newTokensDiscovered: 0,
    cacheHits: 0,
    errors: 0,
    startTime: Date.now(),
  };
}

/**
 * Clear token metadata cache
 */
export function clearTokenCache() {
  const cacheSize = tokenMetadataCache.size;
  tokenMetadataCache.clear();
  console.log(`🧹 [TOKEN-CACHE] Cleared ${cacheSize} cached token metadata entries`);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const now = Date.now();
  let expired = 0;
  let valid = 0;

  for (const [key, entry] of tokenMetadataCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      expired++;
    } else {
      valid++;
    }
  }

  return {
    totalEntries: tokenMetadataCache.size,
    validEntries: valid,
    expiredEntries: expired,
    cacheTtl: CACHE_TTL,
  };
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

export default {
  processTransactionLog,
  detectProxyPattern,
  processApprovalLog,
  getProcessingStats,
  resetProcessingStats,
  clearTokenCache,
  getCacheStats,
  TOKEN_EVENT_SIGNATURES,
};
