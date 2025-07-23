// File: indexer/src/db/queries.js
import { getDbPool } from "./connect.js";

// ======================== BLOCK FUNCTIONS ========================
export async function saveBlock(client, block) {
  try {
    const blockTimestampISO = new Date(block.timestamp * 1000).toISOString();

    // Handle undefined difficulty values
    const difficulty = block.difficulty ? block.difficulty.toString() : "0";
    const totalDifficulty = block.totalDifficulty ? block.totalDifficulty.toString() : "0";

    const query = `
      INSERT INTO blocks (
        block_number, block_hash, parent_hash, block_timestamp, 
        miner, gas_used, gas_limit, transaction_count, 
        base_fee_per_gas, extra_data, size_bytes, difficulty, total_difficulty
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (block_number, block_timestamp) DO NOTHING;
    `;

    const values = [
      block.number,
      block.hash,
      block.parentHash,
      blockTimestampISO,
      block.miner,
      block.gasUsed.toString(),
      block.gasLimit.toString(),
      block.transactions.length,
      block.baseFeePerGas ? block.baseFeePerGas.toString() : null,
      block.extraData,
      block.size || null, // Handle possible undefined size
      difficulty,
      totalDifficulty,
    ];

    await client.query(query, values);
    console.log(`✅ Blok #${block.number} berhasil disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan blok #${block.number}:`, error);
    throw error;
  }
}

// ======================== TRANSACTION FUNCTIONS ========================
export async function saveTransaction(client, tx, blockTimestampISO) {
  try {
    const query = `
      INSERT INTO transactions (
        tx_hash, block_number, block_timestamp, from_address, to_address,
        value_wei, gas_limit, gas_price, transaction_index, nonce, input_data,
        transaction_type, max_fee_per_gas, max_priority_fee_per_gas
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (tx_hash, block_timestamp) DO NOTHING;
    `;

    // Fungsi helper untuk menangani nilai gas
    const safeGasValue = (val) => {
      if (val === undefined || val === null) return "21000"; // Default gas limit
      const numVal = parseInt(val.toString());
      return numVal > 0 ? numVal.toString() : "21000";
    };

    // Penanganan khusus untuk transaction_index
    const transactionIndex = tx.transactionIndex !== undefined && tx.transactionIndex !== null ? tx.transactionIndex : 0; // Nilai default valid

    const values = [
      tx.hash,
      tx.blockNumber,
      blockTimestampISO,
      tx.from,
      tx.to || null,
      tx.value ? tx.value.toString() : "0", // value_wei
      safeGasValue(tx.gas), // gas_limit (dengan penanganan khusus)
      tx.gasPrice ? tx.gasPrice.toString() : "0", // gas_price
      transactionIndex,
      tx.nonce ? tx.nonce.toString() : "0", // nonce
      tx.input,
      tx.type || 0,
      tx.maxFeePerGas ? tx.maxFeePerGas.toString() : null,
      tx.maxPriorityFeePerGas ? tx.maxPriorityFeePerGas.toString() : null,
    ];

    console.log(`ℹ️ Menyimpan transaksi ${tx.hash} dengan gas_limit: ${values[6]}`);
    await client.query(query, values);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan transaksi ${tx.hash}:`, error);
    throw error;
  }
}

export async function updateTransactionReceipt(client, receipt) {
  try {
    const query = `
      UPDATE transactions
      SET gas_used = $1, status = $2
      WHERE tx_hash = $3;
    `;

    const values = [receipt.gasUsed.toString(), receipt.status, receipt.transactionHash];

    await client.query(query, values);
    console.log(`✅ Receipt untuk tx ${receipt.transactionHash} diperbarui.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal memperbarui receipt tx ${receipt.transactionHash}:`, error);
    throw error;
  }
}

// ======================== CONTRACT FUNCTIONS ========================
export async function saveContract(client, receipt, tx, blockTimestamp) {
  try {
    const blockTimestampISO = new Date(blockTimestamp * 1000).toISOString();
    const query = `
      INSERT INTO contracts (
        address, creator_address, creation_tx_hash, block_number, block_timestamp
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (address) DO NOTHING;
    `;

    const values = [
      receipt.contractAddress,
      tx.from,
      tx.hash, // PERBAIKAN: Menggunakan tx.hash yang sudah pasti ada
      receipt.blockNumber,
      blockTimestampISO,
    ];

    await client.query(query, values);
    console.log(`✅ Kontrak baru ${receipt.contractAddress} disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan kontrak ${receipt.contractAddress}:`, error);
    throw error;
  }
}

// ======================== TOKEN FUNCTIONS ========================
export async function saveTokenInfo(client, tokenData) {
  try {
    const query = `
      INSERT INTO tokens (
        contract_address, name, symbol, decimals, 
        total_supply, token_type, is_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (contract_address) 
      DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        decimals = EXCLUDED.decimals,
        total_supply = EXCLUDED.total_supply,
        token_type = EXCLUDED.token_type,
        updated_at = NOW();
    `;

    const values = [tokenData.contractAddress, tokenData.name, tokenData.symbol, tokenData.decimals, tokenData.totalSupply.toString(), tokenData.tokenType || "ERC20", tokenData.isVerified || false];

    await client.query(query, values);
    console.log(`✅ Token ${tokenData.symbol} (${tokenData.contractAddress}) disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan token ${tokenData.contractAddress}:`, error);
    throw error;
  }
}

// ======================== TOKEN TRANSFER FUNCTIONS ========================
export async function saveTokenTransfer(client, transferData) {
  try {
    const blockTimestampISO = new Date(transferData.blockTimestamp * 1000).toISOString();

    const query = `
      INSERT INTO token_transfers (
        tx_hash, log_index, block_number, block_timestamp,
        contract_address, from_address, to_address, value_raw, token_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tx_hash, log_index, block_timestamp) DO NOTHING;
    `;

    const values = [
      transferData.transactionHash,
      transferData.logIndex,
      transferData.blockNumber,
      blockTimestampISO,
      transferData.contractAddress,
      transferData.from,
      transferData.to,
      transferData.value.toString(),
      transferData.tokenId || null,
    ];

    await client.query(query, values);
    console.log(`✅ Transfer token (tx: ${transferData.transactionHash}, log: ${transferData.logIndex}) disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan transfer token ${transferData.transactionHash}:`, error);
    throw error;
  }
}

// ======================== BLOCK PROCESSING ========================
export async function getLatestBlockNumber() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT MAX(block_number) AS latest_number FROM blocks;");
    return parseInt(res.rows[0].latest_number || "-1", 10);
  } finally {
    client.release();
  }
}

export async function processBlock(client, block) {
  // Safety check to ensure we have a valid block object.
  if (!block || typeof block.timestamp === 'undefined') {
    console.error("Invalid or incomplete block object received in processBlock:", block);
    throw new Error(`processBlock called with invalid block object. Block number: ${block?.number}`);
  }

  const blockTimestampISO = new Date(block.timestamp * 1000).toISOString();

  // Simpan blok
  await saveBlock(client, block);

  // Simpan transaksi
  if (block.prefetchedTransactions?.length > 0) {
    for (const tx of block.prefetchedTransactions) {
      await saveTransaction(client, tx, blockTimestampISO);
    }
  }

  console.log(`✅ Blok #${block.number} diproses.`);
  return true;
}

// ======================== BATCH PROCESSING ========================
export async function batchProcessTransactions(receipts) {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const receipt of receipts) {
      await updateTransactionReceipt(client, receipt);
    }

    await client.query("COMMIT");
    console.log(`✅ ${receipts.length} receipt transaksi diproses.`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`❌ Gagal memproses batch receipt:`, error);
    throw error;
  } finally {
    client.release();
  }
}

export async function batchProcessTokenTransfers(transfers) {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const transfer of transfers) {
      await saveTokenTransfer(client, transfer);
    }

    await client.query("COMMIT");
    console.log(`✅ ${transfers.length} transfer token diproses.`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`❌ Gagal memproses batch transfer token:`, error);
    throw error;
  } finally {
    client.release();
  }
}
