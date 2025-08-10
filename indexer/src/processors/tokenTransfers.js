// File: indexer/src/processors/tokenTransfers.js

import { ethers } from "ethers";
import { saveTokenTransfer } from "../db/queries.js";
import { tokenInterfaces, TOKEN_EVENT_SIGNATURES } from "./tokenConstants.js";
import { getTransferType } from "./tokenUtils.js";

/**
 * Process ERC20 Transfer event
 */
export async function processERC20Transfer(log, blockTimestamp, tokenInfo, client, logId) {
  try {
    const parsedLog = tokenInterfaces.erc20.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse ERC20 Transfer event");
    }

    const { from, to, value } = parsedLog.args;

    // Validate addresses
    if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
      throw new Error(`Invalid addresses - from: ${from}, to: ${to}`);
    }

    const humanReadableAmount = ethers.formatUnits(value, tokenInfo.decimals || 18);

    const transferData = {
      tx_hash: log.transactionHash,
      log_index: log.logIndex || 0,
      block_number: log.blockNumber,
      block_timestamp: new Date(blockTimestamp * 1000),
      contract_address: log.address,
      from_address: from,
      to_address: to,
      value: value.toString(),
      token_id: null, // ERC20 has no token_id
    };

    await saveTokenTransfer(client, transferData);

    return {
      success: true,
      from,
      to,
      value: value.toString(),
      humanReadableAmount,
      transferType: getTransferType(from, to),
    };
  } catch (error) {
    console.error(`💥 [TOKEN-ERC20] Error processing ERC20 transfer for ${logId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process ERC721 Transfer event
 */
export async function processERC721Transfer(log, blockTimestamp, tokenInfo, client, logId, provider) {
  try {
    const parsedLog = tokenInterfaces.erc721.parseLog(log);
    if (!parsedLog) {
      throw new Error("Failed to parse ERC721 Transfer event");
    }

    const { from, to, tokenId } = parsedLog.args;

    if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
      throw new Error(`Invalid addresses - from: ${from}, to: ${to}`);
    }

    // Try to get token URI if possible (optional, might fail)
    let tokenUri = null;
    try {
      const contract = new ethers.Contract(log.address, tokenInterfaces.erc721, provider);
      tokenUri = await contract.tokenURI(tokenId);
    } catch (uriError) {
      // console.warn(`⚠️  [TOKEN-ERC721] Could not fetch tokenURI: ${uriError.message}`);
    }

    const transferData = {
      tx_hash: log.transactionHash,
      log_index: log.logIndex || 0,
      block_number: log.blockNumber,
      block_timestamp: new Date(blockTimestamp * 1000),
      contract_address: log.address,
      from_address: from,
      to_address: to,
      value: null, // ERC721 has no value, only token_id
      token_id: tokenId.toString(),
    };

    await saveTokenTransfer(client, transferData);

    return {
      success: true,
      from,
      to,
      tokenId: tokenId.toString(),
      tokenUri,
      transferType: getTransferType(from, to),
    };
  } catch (error) {
    console.error(`💥 [TOKEN-ERC721] Error processing ERC721 transfer for ${logId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process ERC1155 Transfer events (Single and Batch)
 */
export async function processERC1155Transfer(log, blockTimestamp, tokenInfo, client, logId) {
  try {
    const eventTopic = log.topics[0];
    let parsedLog;
    let isBatch = false;

    if (eventTopic === TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_SINGLE) {
      parsedLog = tokenInterfaces.erc1155.parseLog(log);
    } else if (eventTopic === TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_BATCH) {
      parsedLog = tokenInterfaces.erc1155.parseLog(log);
      isBatch = true;
    } else {
      throw new Error("Unknown ERC1155 transfer event");
    }

    if (!parsedLog) {
      throw new Error("Failed to parse ERC1155 Transfer event");
    }

    if (isBatch) {
      const { operator, from, to, ids, values } = parsedLog.args;
      const transferType = getTransferType(from, to);
      const transfers = [];

      for (let i = 0; i < ids.length; i++) {
        const transferData = {
          tx_hash: log.transactionHash,
          log_index: log.logIndex || 0,
          block_number: log.blockNumber,
          block_timestamp: new Date(blockTimestamp * 1000),
          contract_address: log.address,
          from_address: from,
          to_address: to,
          token_id: ids[i].toString(),
          value: values[i].toString(),
        };
        await saveTokenTransfer(client, transferData);
        transfers.push({ tokenId: ids[i].toString(), value: values[i].toString() });
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
      const { operator, from, to, id, value } = parsedLog.args;

      const transferData = {
        tx_hash: log.transactionHash,
        log_index: log.logIndex || 0,
        block_number: log.blockNumber,
        block_timestamp: new Date(blockTimestamp * 1000),
        contract_address: log.address,
        from_address: from,
        to_address: to,
        token_id: id.toString(),
        value: value.toString(),
      };

      await saveTokenTransfer(client, transferData);

      return {
        success: true,
        operator,
        from,
        to,
        tokenId: id.toString(),
        value: value.toString(),
        transferType: getTransferType(from, to),
        isBatch: false,
      };
    }
  } catch (error) {
    console.error(`💥 [TOKEN-ERC1155] Error processing ERC1155 transfer for ${logId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}
