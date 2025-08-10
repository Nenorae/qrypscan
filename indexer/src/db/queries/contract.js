// File: indexer/src/db/queries/contract.js
import { checkProxyStatus } from "../../proxyProcessor.js";

// ======================== CONTRACT FUNCTIONS ========================
export async function saveContract(client, receipt, tx, blockTimestamp, provider) {
  try {
    const blockTimestampISO = new Date(blockTimestamp * 1000).toISOString();
    const contractAddress = receipt.contractAddress;

    // Insert the basic contract information first
    const insertQuery = `
      INSERT INTO contracts (
        address, creator_address, creation_tx_hash, block_number, block_timestamp
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (address) DO NOTHING;
    `;
    const insertValues = [contractAddress, tx.from, tx.hash, receipt.blockNumber, blockTimestampISO];
    const insertResult = await client.query(insertQuery, insertValues);

    // Only proceed if a new row was actually inserted
    if (insertResult.rowCount > 0) {
      console.log(`✅ Kontrak baru ${contractAddress} disimpan.`);

      // Now, check if it's a proxy
      const proxyStatus = await checkProxyStatus(contractAddress, provider);

      if (proxyStatus.is_proxy) {
        console.log(`🔍 Kontrak ${contractAddress} terdeteksi sebagai proxy. Memperbarui...`);
        const updateQuery = `
          UPDATE contracts
          SET is_proxy = $1, implementation_address = $2, admin_address = $3
          WHERE address = $4;
        `;
        const updateValues = [proxyStatus.is_proxy, proxyStatus.implementation_address, proxyStatus.admin_address, contractAddress];
        await client.query(updateQuery, updateValues);
        console.log(`✅ Info proxy untuk ${contractAddress} diperbarui.`);
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan kontrak ${receipt.contractAddress}:`, error);
    throw error;
  }
}
