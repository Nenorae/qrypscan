// File: src/config/index.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Helper untuk mendapatkan path root proyek
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootPath = path.resolve(__dirname, "../../");

// [PERBAIKAN] Memuat file .env dari root direktori proyek
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// [PERBAIKAN] Membangun connection string dari variabel DB_*
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbHost = process.env.DB_HOST || "100.92.191.4";
const dbPort = process.env.DB_PORT;
const dbDatabase = process.env.DB_DATABASE;

const connectionString = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabase}`;

const config = {
  port: process.env.API_PORT || 4000,
  db: {
    // Gunakan connectionString yang sudah dibangun
    connectionString: connectionString,
  },
  node: {
    // Gunakan BESU_HTTP_URL sebagai rpcUrl, atau fallback ke RPC_URL jika tidak ada.
    // Pastikan BESU_HTTP_URL diatur ke URL HTTP, bukan WS.
    rpcUrl: process.env.BESU_HTTP_URL || process.env.RPC_URL || 'http://100.92.191.4:8545',
  },
};

export default config;
