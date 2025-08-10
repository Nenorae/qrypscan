// File: indexer/src/db/queries/token.js
import { getDbPool } from "../connect.js";

// ======================== TOKEN FUNCTIONS ========================
export async function saveTokenInfo(client, tokenAddress, metadata) {
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

    const totalSupply = metadata.supply ? metadata.supply.toString() : "0";

    const values = [
      tokenAddress,
      metadata.name,
      metadata.symbol,
      metadata.decimals,
      totalSupply,
      metadata.tokenType || "ERC20",
      metadata.isVerified || false,
    ];

    await client.query(query, values);
    console.log(`✅ Token ${metadata.symbol} (${tokenAddress}) disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan token ${tokenAddress}:`, error);
    throw error;
  }
}

// ======================== TOKEN TRANSFER FUNCTIONS ========================
export async function saveTokenTransfer(client, transferData) {
  try {
    const blockTimestampISO = new Date(transferData.block_timestamp).toISOString();

    const query = `
      INSERT INTO token_transfers (
        tx_hash, log_index, block_number, block_timestamp,
        contract_address, from_address, to_address, value, token_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tx_hash, log_index, block_timestamp) DO NOTHING;
    `;

    const values = [
      transferData.tx_hash,
      transferData.log_index,
      transferData.block_number,
      blockTimestampISO,
      transferData.contract_address,
      transferData.from_address,
      transferData.to_address,
      transferData.value, // Can be null for ERC721
      transferData.token_id, // Can be null for ERC20
    ];

    await client.query(query, values);
    // console.log(`✅ Transfer token (tx: ${transferData.tx_hash}, log: ${transferData.log_index}) disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan transfer token ${transferData.tx_hash}:`, error);
    throw error;
  }
}

// ======================== BATCH PROCESSING ========================
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
