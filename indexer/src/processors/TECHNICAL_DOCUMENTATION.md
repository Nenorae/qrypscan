# Dokumentasi Teknis: Indexer Processors

Modul ini berisi logika inti untuk menginterpretasikan data mentah dari blockchain (logs & transactions) menjadi informasi terstruktur di database. Modul ini terbagi menjadi dua domain utama: **Token Processing** dan **Proxy Processing**.

---

## 1. Modul Pemrosesan Token (`/processors/token*`)

Indexer mendukung pemrosesan token multi-standar (ERC20, ERC721, ERC1155) dengan mekanisme caching performa tinggi.

### A. Alur Kerja Utama (`tokenMain.js`)
- **Deteksi Standar**: Menggunakan `tokenUtils.detectTokenStandard` untuk menentukan tipe token berdasarkan signature topik log dan jumlah topik (misal: 3 topik untuk ERC20 Transfer, 4 topik untuk ERC721 Transfer).
- **Orkestrasi**: Memanggil sub-processor yang sesuai (`processERC20Transfer`, `processERC721Transfer`, atau `processERC1155Transfer`).
- **Idempotensi**: Mengecek keberadaan log di database sebelum memproses untuk mencegah data duplikat.

### B. Manajemen Metadata & Caching (`tokenMetadata.js`, `tokenCache.js`)
- **Hybrid Metadata Retrieval**: Mencari metadata di cache memori -> database -> blockchain (via RPC).
- **Blockchain Fetching**: Jika token baru ditemukan, indexer memanggil fungsi `name()`, `symbol()`, dan `decimals()` secara paralel menggunakan `Promise.allSettled`.
- **Cache TTL**: Metadata disimpan di memori selama 30 menit (`CACHE_TTL`) untuk mengurangi beban query database dan RPC.

### C. Penanganan Standar Token (`tokenTransfers.js`)
- **ERC20**: Mengekstrak `value` dan menghitung jumlah *human-readable* berdasarkan desimal token.
- **ERC721**: Mengekstrak `tokenId` dan mencoba mengambil `tokenURI` sebagai metadata tambahan.
- **ERC1155**: Menangani event `TransferSingle` dan `TransferBatch`. Pada `TransferBatch`, log tunggal dipecah menjadi beberapa entri di database sesuai jumlah ID token yang ditransfer.

---

## 2. Modul Pemrosesan Proxy (`/processors/proxy*`)

Indexer memiliki sistem canggih untuk mendeteksi dan melacak perubahan implementasi pada kontrak proxy.

### A. Sistem Deteksi Lanjutan (`/processors/proxyDetection/`)
Sistem menggunakan pendekatan heuristik berlapis:
1. **Storage Slot Check**: Memeriksa slot standar EIP-1967 (`IMPLEMENTATION_SLOT`, `ADMIN_SLOT`, `BEACON_SLOT`) dan slot legacy (OpenZeppelin, Compound).
2. **Bytecode Pattern Matching**: Membandingkan bytecode kontrak dengan pola regex yang dikenal (misal: pola EIP-1167 Minimal Proxy atau UUPS fallback).
3. **Behavioral Analysis**: Mendeteksi keberadaan opcode `DELEGATECALL` (0xf4) sebagai indikator dasar proxy.
4. **Beacon Resolution**: Jika terdeteksi Beacon Proxy, indexer akan melakukan panggilan on-chain ke beacon tersebut untuk mendapatkan alamat implementasi aktual.

### B. Decoding Transaksi Admin (`proxyDecoder.js`)
- Menggunakan `ProxyAdminTransactionDecoder` untuk membedah input data transaksi yang ditujukan ke kontrak `ProxyAdmin`.
- Mampu mengidentifikasi pemanggilan fungsi `upgrade`, `upgradeAndCall`, dan `changeProxyAdmin` untuk mengetahui target proxy yang dimodifikasi meskipun event log tidak secara eksplisit menyebutkan alamat proxy (terutama pada pola Transparent Proxy).

### C. Pemrosesan Log Upgrade (`proxyMain.js`)
- Memproses log `Upgraded`, `DiamondCut`, dan `BeaconUpgraded`.
- Melacak riwayat upgrade di tabel `proxy_upgrades` dan memperbarui state terkini di tabel `contracts`.

---

## 3. Statistik & Monitoring (`tokenStats.js`, `proxyStats.js`)
Kedua domain memiliki sistem pelacakan internal untuk memantau kesehatan operasional:
- **Metrics**: Menghitung total log yang diproses, tingkat keberhasilan (*success rate*), *cache hit rate*, dan jumlah token/proxy baru yang ditemukan.
- **Uptime**: Mencatat durasi operasional sejak inisialisasi modul.

---

## Standar Teknis
1. **Concurrency Control**: Pemrosesan batch menggunakan batas konkurensi (default: 5) untuk mencegah lonjakan beban pada node RPC.
2. **Exponential Backoff**: Mekanisme retry otomatis pada kegagalan panggilan RPC dengan jeda waktu yang meningkat secara eksponensial.
3. **Data Integrity**: Selalu memvalidasi format alamat Ethereum menggunakan `ethers.isAddress` sebelum melakukan operasi database atau on-chain.
