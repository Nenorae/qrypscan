import { ethers } from 'ethers';
import { getDbPool } from '../db/connect.js';
import { checkProxyStatus } from '../processors/proxyMain.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const CRON_INTERVAL_MS = process.env.PROXY_RECHECK_INTERVAL_MS || 10 * 60 * 1000; // Default to 10 minutes

/**
 * Fetches all contracts marked as proxies from the database.
 * @param {object} client - The database client.
 * @returns {Promise<Array>} A list of proxy contracts.
 */
async function getProxies(client) {
  const res = await client.query('SELECT address, implementation_address FROM contracts WHERE is_proxy = TRUE');
  return res.rows;
}

/**
 * Updates the implementation address for a given proxy contract.
 * @param {object} client - The database client.
 * @param {string} address - The proxy contract address.
 * @param {string} newImplementationAddress - The new implementation address.
 */
async function updateImplementation(client, address, newImplementationAddress) {
  await client.query('UPDATE contracts SET implementation_address = $1 WHERE address = $2', [newImplementationAddress, address]);
}

/**
 * The main worker function that periodically re-checks proxies.
 */
async function recheckProxies() {
  console.log('--- Memulai Cron Job Pengecekan Ulang Proxy ---');
  const provider = new ethers.JsonRpcProvider(process.env.BESU_HTTP_URL);
  const pool = getDbPool();
  let client;

  try {
    client = await pool.connect();
    const proxies = await getProxies(client);
    console.log(`🔍 Menemukan ${proxies.length} proxy untuk diperiksa ulang.`);

    for (const proxy of proxies) {
      try {
        const currentStatus = await checkProxyStatus(proxy.address, provider);

        if (currentStatus.is_proxy && currentStatus.implementation_address && currentStatus.implementation_address !== proxy.implementation_address) {
          console.log(`⬆️  Upgrade terdeteksi untuk proxy ${proxy.address}!`);
          console.log(`    Alamat lama: ${proxy.implementation_address}`);
          console.log(`    Alamat baru: ${currentStatus.implementation_address}`);

          await updateImplementation(client, proxy.address, currentStatus.implementation_address);
          // Optional: Log this upgrade to a separate `proxy_upgrades` table for history
          console.log(`✅ Implementasi untuk ${proxy.address} telah diperbarui.`);
        }
      } catch (e) {
        console.error(`🔥 Gagal memeriksa ulang proxy ${proxy.address}:`, e.message);
      }
    }
  } catch (error) {
    console.error('💥 Kesalahan fatal dalam cron job proxy:', error.message);
  } finally {
    if (client) {
      client.release();
    }
    console.log('--- Cron Job Pengecekan Ulang Proxy Selesai ---');
  }
}

// --- Main Execution --- //

console.log(`🕒 Cron job pengecekan ulang proxy akan berjalan setiap ${CRON_INTERVAL_MS / 1000} detik.`);

// Run it once immediately, then set the interval
recheckProxies().catch(console.error);
setInterval(() => {
  recheckProxies().catch(console.error);
}, CRON_INTERVAL_MS);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Menghentikan cron job proxy...');
  getDbPool().end(() => {
    console.log('Connection pool ditutup.');
    process.exit(0);
  });
});
