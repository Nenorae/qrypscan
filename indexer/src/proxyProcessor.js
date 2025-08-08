// File: indexer/src/proxyProcessor.js

import { ethers } from "ethers";
import { getDbPool } from "./db/connect.js";
import { updateProxyImplementation } from "./db/queries.js";

// event Upgraded(address indexed implementation);
// Topic hash for the Upgraded event from OpenZeppelin contracts
export const UPGRADED_EVENT_TOPIC = "0xbc7cd75a20ee27fd9adebabcf784c44594004fee1e8ca125ba64cc182b75ceae";

// Minimal ABI for parsing the event
const proxyInterface = new ethers.Interface([
  "event Upgraded(address indexed implementation)"
]);

/**
 * Processes a log entry to check if it's a proxy upgrade event.
 * If it is, it updates the database with the new implementation address.
 * Can use an existing DB client or create a new one.
 * @param {object} log - The log object from the provider.
 * @param {object} [existingClient=null] - An optional existing database client for transactions.
 */
export async function processProxyUpgradeLog(log, existingClient = null) {
  // Check if the topic matches the Upgraded event
  if (log.topics[0] !== UPGRADED_EVENT_TOPIC) {
    return;
  }

  console.log(`... ⬆️  Ditemukan event 'Upgraded' di alamat proxy: ${log.address}`);

  const client = existingClient || await getDbPool().connect();

  try {
    // Parse the log to get the implementation address
    const parsedLog = proxyInterface.parseLog(log);
    if (!parsedLog) {
      console.warn(`... ⚠️ Gagal mem-parsing log 'Upgraded' untuk tx: ${log.transactionHash}`);
      return;
    }

    const { implementation } = parsedLog.args;
    const proxyAddress = log.address;

    console.log(`... 🔗 Hubungan Proxy terdeteksi: ${proxyAddress} -> ${implementation}`);

    // If we're not using an existing client, we manage our own transaction.
    if (!existingClient) await client.query("BEGIN");

    await updateProxyImplementation(client, proxyAddress, implementation);

    if (!existingClient) await client.query("COMMIT");

  } catch (error) {
    if (!existingClient) await client.query("ROLLBACK");
    console.error(`... 🔥 Gagal memproses log 'Upgraded' untuk alamat ${log.address}:`, error);
    // Re-throw if using an external transaction so the parent can roll back
    if (existingClient) throw error;
  } finally {
    // Only release the client if we created it in this function.
    if (!existingClient) client.release();
  }
}
