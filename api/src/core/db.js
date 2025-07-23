// src/core/db.js

import pg from "pg";
import config from "../config/index.js"; // Mengambil konfigurasi terpusat

const { Pool } = pg;

// Singleton pattern: hanya membuat satu instance pool
let pool;

function getDbPool() {
  if (!pool) {
    console.log("🔹 API: Membuat instance connection pool baru...");
    pool = new Pool({
      // Lebih bersih menggunakan satu connection string dari config
      connectionString: config.db.connectionString,
    });

    pool.on("error", (err) => {
      console.error("❌ Kesalahan pada koneksi database API:", err);
    });
  }
  return pool;
}

// Langsung ekspor pool yang sudah diinisialisasi
const db = getDbPool();
export default db;
