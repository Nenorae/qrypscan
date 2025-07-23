// File: indexer/src/db/connect.js (Versi Perbaikan "Lazy Init")

import pg from "pg";
const { Pool } = pg;

// Kita tidak langsung membuat pool di sini.
// Kita buat variabel untuk menampungnya.
let pool;

// Kita buat sebuah fungsi untuk mendapatkan pool.
// Ini adalah "Singleton Pattern", artinya pool hanya akan dibuat satu kali.
export function getDbPool() {
  if (!pool) {
    console.log("🔹 Membuat instance connection pool baru...");
    pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || "5432", 10),
    });

    pool.on("connect", (client) => {
      console.log("🔗 Client baru terhubung ke database dari pool!");
      // Menambahkan log error pada client juga bisa membantu debugging
      client.on("error", (err) => {
        console.error("❌ Terjadi kesalahan pada client database:", err.stack);
      });
    });
  }
  return pool;
}
