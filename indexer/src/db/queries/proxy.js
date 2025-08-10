// File: indexer/src/db/queries/proxy.js

/**
 * Updates the implementation address for a proxy contract in the `contracts` table.
 * This is the single source of truth for the current implementation.
 */
export async function updateContractProxyImplementation(client, proxyAddress, implementationAddress) {
  try {
    const query = `
      UPDATE contracts
      SET implementation_address = $2, is_proxy = TRUE
      WHERE address = $1;
    `;
    await client.query(query, [proxyAddress, implementationAddress]);
    console.log(`✅ Implementasi proxy ${proxyAddress} diperbarui ke ${implementationAddress} di tabel 'contracts'.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal memperbarui implementasi proxy ${proxyAddress} di tabel 'contracts':`, error);
    throw error;
  }
}

/**
 * Records a historic proxy upgrade event in the `proxy_upgrades` table.
 */
export async function recordProxyUpgrade(client, { proxyAddress, implementationAddress, proxyType, txHash, blockNumber, blockTimestamp }) {
  try {
    const query = `
      INSERT INTO proxy_upgrades (proxy_address, implementation_address, proxy_type, tx_hash, block_number, block_timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (proxy_address, tx_hash, implementation_address) DO NOTHING;
    `;
    const values = [proxyAddress, implementationAddress, proxyType, txHash, blockNumber, blockTimestamp];
    await client.query(query, values);
    console.log(`✅ Upgrade proxy ${proxyAddress} ke ${implementationAddress} dicatat.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal mencatat upgrade proxy ${proxyAddress}:`, error);
    throw error;
  }
}

/**
 * Stores the details of a Diamond Proxy's facet cut in the `diamond_facets` table.
 */
export async function storeDiamondCut(client, { proxyAddress, facetAddress, action, functionSelectors, txHash, blockNumber, blockTimestamp }) {
  try {
    const query = `
      INSERT INTO diamond_facets (proxy_address, facet_address, action, function_selectors, tx_hash, block_number, block_timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;
    const values = [proxyAddress, facetAddress, action, functionSelectors, txHash, blockNumber, blockTimestamp];
    await client.query(query, values);
    console.log(`✅ Diamond cut untuk proxy ${proxyAddress} (facet: ${facetAddress}) disimpan.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal menyimpan diamond cut untuk proxy ${proxyAddress}:`, error);
    throw error;
  }
}

/**
 * Updates the beacon address for a beacon proxy in the `beacon_proxies` table.
 */
export async function updateBeaconProxyInfo(client, proxyAddress, beaconAddress) {
  try {
    const query = `
      INSERT INTO beacon_proxies (proxy_address, beacon_address, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (proxy_address) DO UPDATE
      SET beacon_address = $2, updated_at = NOW();
    `;
    await client.query(query, [proxyAddress, beaconAddress]);
    console.log(`✅ Beacon untuk proxy ${proxyAddress} diperbarui ke ${beaconAddress}.`);
    return true;
  } catch (error) {
    console.error(`❌ Gagal memperbarui beacon untuk proxy ${proxyAddress}:`, error);
    throw error;
  }
}
