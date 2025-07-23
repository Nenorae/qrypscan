// File: indexer/src/main.js (Versi Final Tahan Banting)

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { startListener } from "./listener.js";

// --- Logika untuk memastikan .env selalu ditemukan ---
// Mendapatkan path file saat ini (main.js)
const __filename = fileURLToPath(import.meta.url);
// Mendapatkan path direktori saat ini (/.../indexer/src)
const __dirname = path.dirname(__filename);
// Mengarahkan ke file .env yang ada dua tingkat di atas (/.../qrypscan/.env)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
// ----------------------------------------------------

console.log("================== DEBUGGING .env ==================");
console.log(`DB_USER Dilihat oleh Aplikasi: [${process.env.DB_USER}]`);
console.log(`DB_PASSWORD Dilihat oleh Aplikasi: [${process.env.DB_PASSWORD}]`);
console.log(`DB_DATABASE Dilihat oleh Aplikasi: [${process.env.DB_DATABASE}]`);
console.log(`BESU_WS_URL Dilihat oleh Aplikasi: [${process.env.BESU_WS_URL}]`);
console.log("====================================================");

console.log("🚀 Memulai Service Indexer...");

startListener().catch((error) => {
  console.error("💥 Aplikasi Indexer berhenti karena kesalahan fatal:", error);
  process.exit(1);
});
