// File: indexer/src/processors/tokenTransfers.js

import { ethers } from "ethers";
import { saveTokenTransfer } from "../db/queries/index.js";
import { tokenInterfaces, TOKEN_EVENT_SIGNATURES } from "./tokenConstants.js";
import { getTransferType } from "./tokenUtils.js";

/**
 * Process ERC20 Transfer event
 */
export async function processERC20Transfer(log, blockTimestamp, tokenInfo, client, logId) {
  try {
    console.log(`[TOKEN-ERC20] Memproses transfer ERC20 untuk log ${logId}`);
    const parsedLog = tokenInterfaces.erc20.parseLog(log);
    if (!parsedLog) {
      throw new Error("Gagal mem-parse event Transfer ERC20");
    }

    const { from, to, value } = parsedLog.args;
    console.log(`[TOKEN-ERC20] Transfer dari ${from} ke ${to} sejumlah ${value.toString()}`);

    // Validate addresses
    if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
      throw new Error(`Alamat tidak valid - dari: ${from}, ke: ${to}`);
    }

    const humanReadableAmount = ethers.formatUnits(value, tokenInfo.decimals || 18);
    console.log(`[TOKEN-ERC20] Jumlah yang dapat dibaca manusia: ${humanReadableAmount} ${tokenInfo.symbol}`);

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
    console.log(`[TOKEN-DB] Transfer ERC20 untuk ${logId} berhasil disimpan`);

    return {
      success: true,
      from,
      to,
      value: value.toString(),
      humanReadableAmount,
      transferType: getTransferType(from, to),
    };
  } catch (error) {
    console.error(`💥 [TOKEN-ERC20] Error memproses transfer ERC20 untuk ${logId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process ERC721 Transfer event
 */
export async function processERC721Transfer(log, blockTimestamp, tokenInfo, client, logId, provider) {
  try {
    console.log(`[TOKEN-ERC721] Memproses transfer ERC721 untuk log ${logId}`);
    const parsedLog = tokenInterfaces.erc721.parseLog(log);
    if (!parsedLog) {
      throw new Error("Gagal mem-parse event Transfer ERC721");
    }

    const { from, to, tokenId } = parsedLog.args;
    console.log(`[TOKEN-ERC721] Transfer tokenId ${tokenId.toString()} dari ${from} ke ${to}`);

    if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
      throw new Error(`Alamat tidak valid - dari: ${from}, ke: ${to}`);
    }

    // Try to get token URI if possible (optional, might fail)
    let tokenUri = null;
    try {
      console.log(`[TOKEN-ERC721] Mencoba mengambil tokenURI untuk tokenId ${tokenId.toString()}`);
      const contract = new ethers.Contract(log.address, tokenInterfaces.erc721, provider);
      tokenUri = await contract.tokenURI(tokenId);
      console.log(`[TOKEN-ERC721] Berhasil mengambil tokenURI: ${tokenUri}`);
    } catch (uriError) {
      console.warn(`⚠️  [TOKEN-ERC721] Tidak dapat mengambil tokenURI: ${uriError.message}`);
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
    console.log(`[TOKEN-DB] Transfer ERC721 untuk ${logId} berhasil disimpan`);

    return {
      success: true,
      from,
      to,
      tokenId: tokenId.toString(),
      tokenUri,
      transferType: getTransferType(from, to),
    };
  } catch (error) {
    console.error(`💥 [TOKEN-ERC721] Error memproses transfer ERC721 untuk ${logId}: ${error.message}`);
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
      console.log(`[TOKEN-ERC1155] Memproses event TransferSingle untuk ${logId}`);
      parsedLog = tokenInterfaces.erc1155.parseLog(log);
    } else if (eventTopic === TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_BATCH) {
      console.log(`[TOKEN-ERC1155] Memproses event TransferBatch untuk ${logId}`);
      parsedLog = tokenInterfaces.erc1155.parseLog(log);
      isBatch = true;
    } else {
      throw new Error("Event transfer ERC1155 tidak dikenal");
    }

    if (!parsedLog) {
      throw new Error("Gagal mem-parse event Transfer ERC1155");
    }

    if (isBatch) {
      const { operator, from, to, ids, values } = parsedLog.args;
      console.log(`[TOKEN-ERC1155-BATCH] Operator: ${operator}, Dari: ${from}, Ke: ${to}`);
      console.log(`[TOKEN-ERC1155-BATCH] Mentransfer ${ids.length} token dalam satu batch`);
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
        console.log(`[TOKEN-ERC1155-BATCH] Disimpan: tokenId ${ids[i].toString()}, value ${values[i].toString()}`);
      }

      console.log(`[TOKEN-DB] Transfer batch ERC1155 untuk ${logId} berhasil disimpan`);
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
      console.log(`[TOKEN-ERC1155-SINGLE] Operator: ${operator}, Dari: ${from}, Ke: ${to}`);
      console.log(`[TOKEN-ERC1155-SINGLE] Transfer tokenId ${id.toString()} sejumlah ${value.toString()}`);

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
      console.log(`[TOKEN-DB] Transfer tunggal ERC1155 untuk ${logId} berhasil disimpan`);

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
    console.error(`💥 [TOKEN-ERC1155] Error memproses transfer ERC1155 untuk ${logId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}
