# Dokumentasi Teknis: Indexer Core Orchestration & Utilities

Dokumen ini menjelaskan komponen inti yang menggerakkan sistem Indexer, mulai dari manajemen *lifecycle* aplikasi, orkestrasi sinkronisasi data (historis dan real-time), hingga lapisan utilitas.

---

## 1. Komponen Orkestrasi Utama

### [@indexer/src/main.js] - Entry Point
- **Tanggung Jawab**: Inisialisasi lingkungan dan bootstrap aplikasi.
- **Logika**: 
    - Memastikan pemuatan variabel lingkungan `.env` dari root proyek.
    - Melakukan debugging konfigurasi (koneksi DB dan RPC).
    - Memulai `startListener()` untuk pemrosesan data secara real-time.
- **Resilience**: Menggunakan `.catch()` pada level tertinggi untuk menangkap *fatal errors* dan melakukan `process.exit(1)` guna memicu *restart* otomatis oleh manajer proses (misal: PM2).

### [@indexer/src/indexer.js] - Historical Indexer
- **Tanggung Jawab**: Sinkronisasi data blok lama (catch-up) dari titik indeks terakhir hingga blok terbaru on-chain.
- **Alur Kerja**:
    1. Mengambil `lastIndexedBlock` dari database.
    2. Iterasi blok secara linear dari `lastIndexedBlock + 1`.
    3. Mengambil blok lengkap beserta data transaksi (`getBlock(number, true)`).
    4. **Atomic Processing**: Membuka transaksi database per blok untuk memastikan integritas data (Block -> Txs -> Logs -> Contract Creation).
    5. Menjalankan deteksi *fallback* proxy jika log upgrade tidak ditemukan.

### [@indexer/src/listener.js] - Real-time Listener
- **Tanggung Jawab**: Ingesti data blok baru secara instan menggunakan protokol WebSocket.
- **Teknologi**: Menggunakan `ethers.WebSocketProvider` untuk mendengarkan event `"block"`.
- **Logika Pemrosesan**: Memiliki logika pemrosesan yang identik dengan *Historical Indexer*, namun dipicu secara *event-driven*. 
- **Stabilitas**: Memantau event `error` pada koneksi WebSocket untuk mendeteksi disrupsi jaringan.

---

## 2. Lapisan Facade & Processing Aggregators

Komponen ini bertindak sebagai perantara (*facade*) antara orkestrator inti dan logika pemrosesan detail di folder `processors/`.

### [@indexer/src/tokenProcessor.js]
- **Fungsi**: Mengekspos fungsionalitas pemrosesan transfer token (ERC20, ERC721, ERC1155) dan persetujuan (*approval*).
- **Fitur Tambahan**: Menyediakan akses ke statistik pemrosesan token dan manajemen cache metadata (clear/stats).

### [@indexer/src/proxyProcessor.js]
- **Fungsi**: Mengekspos logika deteksi dan pemrosesan upgrade proxy.
- **Fallback Logic**: Menyediakan fungsi `processPossibleProxyUpgradeTransaction` yang memungkinkan deteksi upgrade melalui analisis input data transaksi tanpa bergantung pada event log.

---

## 3. Utilities & ABI

### [@indexer/src/utils/erc20Abi.js]
- **Isi**: Definisi ABI minimal untuk standar ERC20.
- **Kegunaan**: Digunakan oleh `tokenMetadata.js` untuk melakukan panggilan *on-chain* (`name`, `symbol`, `decimals`, `totalSupply`) tanpa perlu memuat file ABI lengkap yang besar.

---

## 4. Karakteristik Teknis Sistem

### A. Atomisitas Transaksi (Database Integrity)
Sistem menggunakan objek `client` dari pool database untuk menjalankan transaksi SQL (`BEGIN`, `COMMIT`, `ROLLBACK`) yang membungkus seluruh operasi pemrosesan satu blok. Hal ini menjamin bahwa jika terjadi kegagalan pada pemrosesan log di tengah jalan, status blok dan transaksi dasar tidak akan tersimpan secara parsial.

### B. Dual-Path Detection (Proxy)
Indexer tidak hanya mengandalkan log event untuk mendeteksi upgrade proxy. Jika pemrosesan log selesai tanpa menemukan event upgrade, sistem akan menjalankan deteksi berbasis transaksi. Detektor ini membedah data input transaksi menggunakan `ProxyAdminTransactionDecoder` untuk mencari pemanggilan fungsi administratif yang mengubah alamat implementasi.

### C. Efisiensi Pengambilan Data
Dalam loop indexing, sistem menggunakan `prefetchedTransactions` yang tersedia dari objek blok untuk mengurangi jumlah panggilan RPC ke node. Panggilan `getTransactionReceipt` dilakukan secara sekuensial per transaksi untuk mendapatkan log event yang akurat.

---

## Standar Operasional
1. **Idempotency**: Semua query database menggunakan `ON CONFLICT DO NOTHING` untuk memastikan pemrosesan ulang blok yang sama tidak merusak data.
2. **Environment Isolation**: Konfigurasi selalu merujuk ke `.env` pusat untuk menjaga konsistensi antara Indexer dan API.
3. **Graceful Shutdown**: Menutup pool koneksi database secara bersih saat proses dihentikan (terutama pada `indexer.js`).
