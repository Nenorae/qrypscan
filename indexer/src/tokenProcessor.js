// File: indexer/src/tokenProcessor.js

import { ethers } from "ethers";
import { erc20Abi } from "./utils/erc20Abi.js";
import { getDbPool } from "./db/connect.js";
import { saveTokenInfo, saveTokenTransfer } from "./db/queries.js";

// Topik hash untuk event Transfer(address,address,uint256)
const TRANSFER_EVENT_TOPIC = ethers.id("Transfer(address,address,uint256)");
const erc20Interface = new ethers.Interface(erc20Abi);

export async function processTransactionLog(log, blockTimestamp, provider) {
  // Cek apakah log ini adalah event Transfer ERC-20
  if (log.topics[0] !== TRANSFER_EVENT_TOPIC || log.topics.length !== 3) {
    return;
  }

  const pool = getDbPool();
  const client = await pool.connect();
  let tokenDetails = {};

  try {
    const contractAddress = log.address;
    console.log(`... 🪙 Ditemukan event Transfer ERC-20 di kontrak: ${contractAddress}`);

    // Cek apakah kita sudah punya info token ini di DB
    const tokenInfoResult = await client.query("SELECT * FROM tokens WHERE contract_address = $1", [contractAddress]);

    if (tokenInfoResult.rowCount > 0) {
      tokenDetails = tokenInfoResult.rows[0];
    } else {
      // Jika belum ada, ambil metadata dari blockchain
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
          tokenType: "ERC20",
        };

        // Simpan metadata ke DB
        await saveTokenInfo(client, tokenDetails);
      } catch (e) {
        console.warn(`... ⚠️ Kontrak ${contractAddress} terlihat seperti ERC20 tapi gagal mengambil metadata. Error: ${e.message}`);
        return; // Lanjut ke log berikutnya jika bukan ERC20 standar
      }
    }

    // Parsing data dari log
    const parsedLog = erc20Interface.parseLog(log);
    if (!parsedLog) {
      console.warn(`... ⚠️ Gagal mem-parsing log untuk tx: ${log.transactionHash}`);
      return; // Tidak bisa parse log, lanjut
    }
    const { from, to, value } = parsedLog.args;

    // Simpan data transfer ke DB
    const transferData = {
      transactionHash: log.transactionHash,
      logIndex: log.index,
      blockNumber: log.blockNumber,
      blockTimestamp,
      contractAddress,
      from,
      to,
      value,
    };
    await saveTokenTransfer(client, transferData);

    console.log(`... ✅ Transfer dari ${from} ke ${to} senilai ${ethers.formatUnits(value, tokenDetails.decimals || 18)} ${tokenDetails.symbol || ""} berhasil dicatat.`);
  } catch (error) {
    console.error(`... 🔥 Gagal memproses log transfer token:`, error);
  } finally {
    client.release();
  }
}
