// File: indexer/src/db/queries/contract.js
import { detectProxyContract } from "../../processors/proxyDetection/index.js";

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

      // Now, check if it's a proxy using the new advanced detection
      const proxyStatus = await detectProxyContract(contractAddress, provider);

      if (proxyStatus.isProxy) {
        console.log(`🔍 Kontrak ${contractAddress} terdeteksi sebagai proxy (${proxyStatus.proxyType}) dengan tingkat keyakinan ${proxyStatus.confidence}. Memperbarui...`);
        const updateQuery = `
          UPDATE contracts
          SET is_proxy = TRUE, 
              implementation_address = $1, 
              admin_address = $2,
              proxy_type = $3
          WHERE address = $4;
        `;
        const updateValues = [
          proxyStatus.implementation,
          proxyStatus.admin,
          proxyStatus.proxyType,
          contractAddress
        ];
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
