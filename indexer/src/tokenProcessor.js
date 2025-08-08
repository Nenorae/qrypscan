// File: indexer/src/tokenProcessor.js

import { ethers } from "ethers";
import { erc20Abi } from "./utils/erc20Abi.js";
import { getDbPool } from "./db/connect.js";
import { saveTokenInfo, saveTokenTransfer } from "./db/queries.js";

// Topik hash untuk event Transfer(address,address,uint256)
const TRANSFER_EVENT_TOPIC = ethers.id("Transfer(address,address,uint256)");
const erc20Interface = new ethers.Interface(erc20Abi);

/**
 * Processes a log entry to check if it's a token transfer event.
 * If it is, it saves the token info (if new) and the transfer details.
 * Can use an existing DB client or create a new one.
 * @param {object} log - The log object from the provider.
 * @param {number} blockTimestamp - The timestamp of the block containing the log.
 * @param {object} provider - The Ethers provider instance.
 * @param {object} [existingClient=null] - An optional existing database client for transactions.
 */
export async function processTransactionLog(log, blockTimestamp, provider, existingClient = null) {
  // Check if this is a standard ERC20/ERC721 Transfer event
  if (log.topics[0] !== TRANSFER_EVENT_TOPIC || log.topics.length < 3) {
    return;
  }

  const client = existingClient || await getDbPool().connect();
  let tokenDetails = {};

  try {
    const contractAddress = log.address;
    console.log(`... 🪙 Ditemukan event Transfer di kontrak: ${contractAddress}`);

    // If not using an existing client, we manage our own transaction.
    if (!existingClient) await client.query("BEGIN");

    const tokenInfoResult = await client.query("SELECT * FROM tokens WHERE contract_address = $1", [contractAddress]);

    if (tokenInfoResult.rowCount > 0) {
      tokenDetails = tokenInfoResult.rows[0];
    } else {
      console.log(`... ℹ️ Mengambil metadata token baru...`);
      const contract = new ethers.Contract(contractAddress, erc20Abi, provider);
      try {
        const [name, symbol, decimals, totalSupply] = await Promise.all([
          contract.name(),
          contract.symbol(),
          contract.decimals(),
          contract.totalSupply(),
        ]);

        tokenDetails = {
          contractAddress,
          name,
          symbol,
          decimals: Number(decimals),
          totalSupply,
          tokenType: "ERC20", // Default to ERC20, can be refined later
        };
        await saveTokenInfo(client, tokenDetails);
      } catch (e) {
        console.warn(`... ⚠️ Kontrak ${contractAddress} mungkin bukan ERC20 standar. Error: ${e.message}`);
        // We can still proceed to save the transfer without full metadata
      }
    }

    const parsedLog = erc20Interface.parseLog(log);
    if (!parsedLog) {
      console.warn(`... ⚠️ Gagal mem-parsing log untuk tx: ${log.transactionHash}`);
      return;
    }
    const { from, to, value } = parsedLog.args;

    const transferData = {
      transactionHash: log.transactionHash,
      logIndex: log.index,
      blockNumber: log.blockNumber,
      blockTimestamp,
      contractAddress,
      from,
      to,
      value,
      tokenId: log.topics.length === 4 ? BigInt(log.topics[3]).toString() : null,
    };
    await saveTokenTransfer(client, transferData);

    console.log(`... ✅ Transfer di ${tokenDetails.symbol || contractAddress} berhasil dicatat.`);

    if (!existingClient) await client.query("COMMIT");

  } catch (error) {
    if (!existingClient) await client.query("ROLLBACK");
    console.error(`... 🔥 Gagal memproses log transfer token:`, error);
    if (existingClient) throw error;
  } finally {
    if (!existingClient) client.release();
  }
}
