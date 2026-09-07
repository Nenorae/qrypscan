# Dokumentasi Teknis Sistem: Qrypscan

Dokumen ini merupakan konsolidasi dari seluruh dokumentasi teknis modular di ekosistem Qrypscan, mencakup Backend API, Frontend, dan Indexer. Dokumen ini dirancang untuk memberikan pemahaman menyeluruh tentang arsitektur sistem dan sebagai referensi pembuatan diagram teknis.

---

## 1. Backend API (Core & Features)

### 1.1 Infrastruktur Inti (Core & Config)

#### A. Manajemen Konfigurasi (`/api/src/config/index.js`)
Sistem menggunakan pendekatan konfigurasi terpusat:
- **Environment Variables**: Memuat file `.env` dari root direktori proyek menggunakan `dotenv`.
- **Database Connection**: Membangun *connection string* PostgreSQL secara dinamis dari variabel `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, dan `DB_DATABASE`.
- **Blockchain RPC**: Menentukan URL RPC node (Besu) dengan mekanisme *fallback* (`BESU_HTTP_URL` -> `RPC_URL` -> default).
- **Export**: Mengekspor objek `config` yang berisi `port`, `db.connectionString`, dan `node.rpcUrl`.

#### B. Layer Database (`/api/src/core/db.js`)
- **Singleton Pattern**: Menggunakan library `pg` (node-postgres) untuk membuat satu instance `Pool` koneksi database yang digunakan di seluruh aplikasi.
- **Error Handling**: Mendengarkan event `error` pada pool untuk mencegah crash aplikasi akibat kegagalan koneksi database yang tidak terduga.

#### C. Sistem Logging (`/api/src/core/logger.js`)
Sistem menggunakan `winston` untuk logging tingkat lanjut:
- **Dual Transports**: Log dikirim ke `Console` (berwarna untuk pengembangan) dan file `verification_log.txt` di root proyek.
- **Custom Formatter**: Mampu menangani string, objek JSON (dengan `util.inspect`), dan *stack trace* error secara rapi.
- **Contextual Logging**: Mendukung level log (`info`, `debug`, `error`, `warn`) yang dikontrol melalui variabel lingkungan `LOG_LEVEL`.

#### D. Arsitektur Server (`/api/src/core/server.js`)
Menggunakan Express.js terintegrasi dengan Apollo Server:
- **Apollo Server (GraphQL)**: 
    - Memuat tipe data (`typeDefs`) dan resolver secara otomatis dari seluruh folder `features` menggunakan `loadFilesSync`.
    - Mendukung skalar kustom `JSON` (`graphql-type-json`).
- **Middleware Kustom**:
    - `requestLogger`: Mencatat setiap request masuk dengan detail metadata (IP, User-Agent, Durasi).
    - `bodyParserWithLogging`: Melakukan parsing body (`JSON` atau `url-encoded`) sambil mencatat *raw body* untuk keperluan debugging verifikasi kontrak.
    - `multerLogger`: Menangani unggahan file multipart (digunakan oleh plugin Hardhat).
- **Routing**:
    - `/graphql`: Endpoint utama untuk operasi data front-end.
    - `/api` & `/verify`: Endpoint REST khusus yang kompatibel dengan API Etherscan untuk verifikasi kontrak via Hardhat.
    - `/images`: Melayani aset gambar logo token secara statis.
- **Security & Reliability**: Implementasi CORS, *health check endpoint* (`/health`), dan *global error handler* untuk menangkap eksepsi yang tidak tertangani.

### 1.2 Modul Fitur (Features)

#### A. Addresses (`/api/src/features/addresses`)
Mengelola data alamat Ethereum (EOA/Kontrak), saldo *real-time*, dan riwayat transaksi.
- **`address.service.js`**: Melakukan agregasi data DB dan Node secara paralel. Mengimplementasikan logika *suppression* log untuk mencegah banjir pesan error saat node offline.

#### B. Blocks (`/api/src/features/blocks`)
Menyediakan akses ke data blok yang telah diindeks.
- **`block.resolver.js`**: Mengimplementasikan *nested resolver* untuk field `transactions` yang memanggil fungsi di modul transaksi.

#### C. Contracts (`/api/src/features/contracts`)
Modul paling kompleks untuk metadata kontrak dan verifikasi.
- **Arsitektur Verifikasi**: Pipeline linear (Validate -> Get Bytecode -> Compile via `solc` -> Compare -> Save).
- **Bytecode Utils**: Membersihkan hash metadata Swarm/IPFS untuk memastikan perbandingan yang akurat antara kode sumber dan bytecode on-chain.
- **Proxy Support**: Deteksi otomatis tipe proxy dan verifikasi tautan antara alamat proxy dan implementasi.

#### D. Token (`/api/src/features/token`)
Menangani metadata token ERC20 dan aset visual.
- **`token.service.js`**: Secara dinamis mencari file logo `<address>.png` di folder aset fisik dan menghasilkan URL absolut.

#### E. Transactions (`/api/src/features/transactions`)
Akses ke transaksi umum dan transfer token.
- **`transaction.model.js`**: Menggunakan query SQL performan untuk pencarian riwayat transaksi berdasarkan alamat (case-insensitive).

---

## 2. Frontend (Core, Pages & Components)

### 2.1 Infrastruktur Inti & Halaman

#### A. Global State: Theme Management (`/frontend/context/ThemeContext.js`)
Mengelola sistem tema (Dark/Light Mode) aplikasi secara menyeluruh.
- **Hydration Safety**: Menggunakan state `mounted` untuk memastikan transisi tema hanya terjadi setelah komponen di-mount di sisi klien. Hal ini mencegah perbedaan *class* antara server (SSR) dan klien (Hydration error).
- **Persistence**: Menyimpan pilihan pengguna di `localStorage`.
- **System Preference**: Mendeteksi preferensi sistem (`prefers-color-scheme: dark`) sebagai fallback awal.

#### B. API Client Configuration (`/frontend/lib/api.js`)
Konfigurasi terpusat untuk komunikasi GraphQL.
- **Apollo Client**: Menggunakan `HttpLink` untuk menghubungkan ke API server.
- **Environment Variable**: Menggunakan `NEXT_PUBLIC_GRAPHQL_API_URL` dengan fallback otomatis ke alamat IP internal pengembangan.
- **Caching**: Menggunakan `InMemoryCache` untuk mengoptimalkan navigasi antar halaman.

#### C. Struktur Halaman & Logika Routing (`/frontend/pages`)
Aplikasi ini menggunakan pola **Server-Side Rendering (SSR)** via `getServerSideProps` pada hampir setiap halaman dinamis.
- **Entry Point (`_app.js`)**: Membungkus aplikasi dengan `ThemeProvider` dan `ApolloProvider`.
- **Detail Alamat (`address/[address].js`)**: Validasi format `ethers.isAddress` dan *intelligent redirect* ke `/contract/[address]` jika terdeteksi sebagai kontrak.
- **Detail Blok (`block/[blockNumber].js`)**: SSR fetching dengan *Hydration Fix* (TimestampCell) untuk konsistensi zona waktu.
- **Detail Kontrak (`contract/[address].js`)**: Logika kondisional untuk `VerifiedInfo` (kode sumber + ABI) atau `UnverifiedInfo`.
- **Detail Transaksi (`tx/[txHash].js`)**: *Double-Pass Query* untuk decoding input data menggunakan `ethers.Interface` jika ABI tersedia.

### 2.2 Komponen Antarmuka (Components)

#### A. Komponen Inti Kontrak (`/frontend/components/ContractDetails.js`, `/ContractInteractor.js`)
- **`ContractDetails.js`**: Orkestrator tab navigasi (Contract, Transactions, Read/Write) dan penanganan banner proxy.
- **`ContractInteractor.js`**: Antarmuka dinamis untuk fungsi Read/Write. Menggunakan `JsonRpcProvider` untuk Read dan `BrowserProvider` (MetaMask) untuk Write. Mendukung input dinamis berdasarkan fragmen ABI.

#### B. Visualisasi Data & Navigasi
- **`SourceCodeViewer.js`**: Mendukung multi-file source code dengan syntax highlighting yang sinkron dengan tema sistem.
- **`TransactionList.js`**: Menampilkan transfer token dengan query `transactionsByContractAddress`.
- **`SearchBar.js`**: Logika routing cerdas (42 char -> Address, 66 char -> Tx, Numeric -> Block).

#### C. Dashboard & Real-time
- **Polling Strategy**: Komponen `LatestBlocks` dan `LatestTransactions` menggunakan `pollInterval: 4000` (4 detik) dari Apollo Client untuk pembaruan data real-time.

---

## 3. Indexer (Core, Database & Processors)

### 3.1 Orkestrasi & Core Indexer

#### A. Entry Point & Lifecycle (`/indexer/src/main.js`)
- Inisialisasi lingkungan, bootstrap aplikasi, dan memulai `startListener()` untuk pemrosesan real-time.
- Mekanisme *restart* otomatis via *fatal error handling* di level tertinggi.

#### B. Historical Indexer (`/indexer/src/indexer.js`)
- Sinkronisasi linear dari blok terakhir di DB (`lastIndexedBlock`) hingga blok terbaru di chain.
- **Atomic Processing**: Membungkus satu blok (Block, Txs, Logs, Contract Creation) dalam satu transaksi database untuk integritas data.

#### C. Real-time Listener (`/indexer/src/listener.js`)
- Menggunakan `ethers.WebSocketProvider` untuk ingesti blok baru secara instan. Memiliki logika pemrosesan yang identik dengan Historical Indexer.

### 3.2 Database Module (`/indexer/src/db`)

#### A. Arsitektur Skema & TimescaleDB
Sistem dioptimalkan untuk data *time-series* menggunakan **TimescaleDB**.
- **Hypertables**: Tabel `blocks`, `transactions`, `token_transfers`, dan `event_logs` dipartisi otomatis berbasis `block_timestamp` (interval 1 hari).
- **Compression Policies**: Kompresi otomatis setelah 7 hari untuk efisiensi ruang (>90%).
- **Continuous Aggregates**: *Materialized Views* (`daily_blockchain_stats`) yang di-refresh otomatis untuk statistik performa.

#### B. Lapisan Query (Queries)
- **Domain-Specific Queries**: Dipisahkan menjadi `block.js`, `transaction.js`, `contract.js`, `token.js`, `proxy.js`, dan `log.js`.
- **Idempotency**: Penggunaan luas `ON CONFLICT DO NOTHING` untuk memastikan pemrosesan ulang tidak merusak data.

### 3.3 Logic Processors (`/indexer/src/processors`)

#### A. Pemrosesan Token (`/indexer/src/processors/token*`)
- **Multi-standard Support**: ERC20, ERC721, dan ERC1155 (termasuk `TransferBatch`).
- **Hybrid Metadata Retrieval**: Caching 30 menit (`tokenCache.js`) untuk metadata yang diambil via RPC (`name`, `symbol`, `decimals`).

#### B. Pemrosesan Proxy (`/indexer/src/processors/proxy*`)
- **Deteksi Lanjutan**: Pendekatan heuristik menggunakan Storage Slot (EIP-1967), pattern matching bytecode, dan analisis opcode `DELEGATECALL`.
- **Decoding Admin Tx**: `ProxyAdminTransactionDecoder` membedah input data untuk melacak upgrade fungsi administratif (`upgrade`, `upgradeAndCall`).
- **Beacon Support**: Resolusi on-chain untuk Beacon Proxy guna mendapatkan alamat implementasi.

---

## 4. Standar Implementasi Global

### 4.1 Pengembangan API & Indexer
1. **Separation of Concerns**: Schema -> Resolver -> Service -> Model (untuk API) dan Orchestrator -> Processor -> Query (untuk Indexer).
2. **Naming Convention**: Database menggunakan `snake_case`, API/GraphQL/Frontend menggunakan `camelCase`.
3. **Data Integrity**: Penggunaan transaksi SQL (`BEGIN`/`COMMIT`) untuk setiap unit pemrosesan blok atau batch transaksi.
4. **Resiliency**: Pengecekan proaktif status RPC node dan penanganan diskoneksi database/WebSocket secara otomatis.

### 4.2 Frontend & UI/UX
1. **SSR (Server-Side Rendering)**: Prioritas pada SEO dan kesegaran data blockchain.
2. **Theming**: Dukungan Dark/Light mode yang sinkron dari context hingga komponen sintaks highlighter.
3. **Blockchain standard**: Penggunaan `ethers.js` v6 untuk semua interaksi data hex, validasi alamat, dan parsing ABI.
