import { ethers } from 'ethers';
import { getDbPool } from '../db/connect.js';
import { detectProxyContract } from '../processors/proxyDetection.js';
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
  const res = await client.query('SELECT address, implementation_address, admin_address, proxy_type FROM contracts WHERE is_proxy = TRUE');
  return res.rows;
}

/**
 * Updates the proxy details for a given proxy contract.
 * @param {object} client - The database client.
 * @param {string} address - The proxy contract address.
 * @param {object} proxyStatus - The new proxy status from detection.
 */
async function updateProxyDetails(client, address, proxyStatus) {
  const query = `
    UPDATE contracts 
    SET implementation_address = $1, admin_address = $2, proxy_type = $3
    WHERE address = $4
  `;
  const values = [proxyStatus.implementation, proxyStatus.admin, proxyStatus.proxyType, address];
  await client.query(query, values);
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
        const currentStatus = await detectProxyContract(proxy.address, provider);

        // Check if the implementation has changed
        if (currentStatus.isProxy && currentStatus.implementation && currentStatus.implementation !== proxy.implementation_address) {
          console.log(`⬆️  Upgrade terdeteksi untuk proxy ${proxy.address}!`);
          console.log(`    Alamat implementasi lama: ${proxy.implementation_address}`);
          console.log(`    Alamat implementasi baru: ${currentStatus.implementation}`);
          console.log(`    Jenis proxy: ${currentStatus.proxyType}`);

          await updateProxyDetails(client, proxy.address, currentStatus);
          // Optional: Log this upgrade to a separate `proxy_upgrades` table for history
          console.log(`✅ Implementasi untuk ${proxy.address} telah diperbarui.`);
        } else if (currentStatus.isProxy && currentStatus.admin !== proxy.admin_address) {
            console.log(`🔄 Perubahan admin terdeteksi untuk proxy ${proxy.address}`);
            console.log(`    Admin lama: ${proxy.admin_address}`);
            console.log(`    Admin baru: ${currentStatus.admin}`);
            await updateProxyDetails(client, proxy.address, currentStatus);
            console.log(`✅ Admin untuk ${proxy.address} telah diperbarui.`);
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
