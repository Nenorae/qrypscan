// File: src/index.js

import { startServer } from "./core/server.js";
import config from "./config/index.js";

async function main() {
  try {
    // Dapatkan server yang sudah dikonfigurasi
    const httpServer = await startServer();

    // Jalankan server di port yang ditentukan
    await new Promise((resolve) => httpServer.listen({ port: config.port }, resolve));

    console.log(`🚀 Server API siap di http://localhost:${config.port}/graphql`);
  } catch (error) {
    console.error("💥 Gagal memulai server API:", error);
    process.exit(1); // Keluar dari proses jika ada error fatal saat startup
  }
}

main();
