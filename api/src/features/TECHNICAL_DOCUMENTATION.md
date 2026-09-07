# Dokumentasi Teknis: API Module (Core & Features)

Dokumen ini merinci arsitektur, konfigurasi, dan implementasi teknis dari backend API. Sistem ini dibangun menggunakan Node.js dengan pola **Schema-Resolver-Service-Model** untuk fitur, didukung oleh infrastruktur inti yang kuat di folder `core` dan `config`.

---

## 1. Infrastruktur Inti (Core & Config)

### A. Manajemen Konfigurasi (`/config/index.js`)
Sistem menggunakan pendekatan konfigurasi terpusat:
- **Environment Variables**: Memuat file `.env` dari root direktori proyek menggunakan `dotenv`.
- **Database Connection**: Membangun *connection string* PostgreSQL secara dinamis dari variabel `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, dan `DB_DATABASE`.
- **Blockchain RPC**: Menentukan URL RPC node (Besu) dengan mekanisme *fallback* (`BESU_HTTP_URL` -> `RPC_URL` -> default).
- **Export**: Mengekspor objek `config` yang berisi `port`, `db.connectionString`, dan `node.rpcUrl`.

### B. Layer Database (`/core/db.js`)
- **Singleton Pattern**: Menggunakan library `pg` (node-postgres) untuk membuat satu instance `Pool` koneksi database yang digunakan di seluruh aplikasi.
- **Error Handling**: Mendengarkan event `error` pada pool untuk mencegah crash aplikasi akibat kegagalan koneksi database yang tidak terduga.

### C. Sistem Logging (`/core/logger.js`)
Sistem menggunakan `winston` untuk logging tingkat lanjut:
- **Dual Transports**: Log dikirim ke `Console` (berwarna untuk pengembangan) dan file `verification_log.txt` di root proyek.
- **Custom Formatter**: Mampu menangani string, objek JSON (dengan `util.inspect`), dan *stack trace* error secara rapi.
- **Contextual Logging**: Mendukung level log (`info`, `debug`, `error`, `warn`) yang dikontrol melalui variabel lingkungan `LOG_LEVEL`.

### D. Arsitektur Server (`/core/server.js`)
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

---

## 2. Modul Fitur (Features)

### A. Addresses (`/addresses`)
Mengelola data alamat Ethereum (EOA/Kontrak), saldo *real-time*, dan riwayat transaksi.
- **`address.service.js`**: Melakukan agregasi data DB dan Node secara paralel. Mengimplementasikan logika *suppression* log untuk mencegah banjir pesan error saat node offline.

### B. Blocks (`/blocks`)
Menyediakan akses ke data blok yang telah diindeks.
- **`block.resolver.js`**: Mengimplementasikan *nested resolver* untuk field `transactions` yang memanggil fungsi di modul transaksi.

### C. Contracts (`/contracts`)
Modul paling kompleks untuk metadata kontrak dan verifikasi.
- **Arsitektur Verifikasi**: Pipeline linear (Validate -> Get Bytecode -> Compile via `solc` -> Compare -> Save).
- **Bytecode Utils**: Membersihkan hash metadata Swarm/IPFS untuk memastikan perbandingan yang akurat antara kode sumber dan bytecode on-chain.
- **Proxy Support**: Deteksi otomatis tipe proxy dan verifikasi tautan antara alamat proxy dan implementasi.

### D. Token (`/token`)
Menangani metadata token ERC20 dan aset visual.
- **`token.service.js`**: Secara dinamis mencari file logo `<address>.png` di folder aset fisik dan menghasilkan URL absolut.

### E. Transactions (`/transactions`)
Akses ke transaksi umum dan transfer token.
- **`transaction.model.js`**: Menggunakan query SQL performan untuk pencarian riwayat transaksi berdasarkan alamat (case-insensitive).

---

## 3. Standar Implementasi Global
1. **Separation of Concerns**: Schema (GraphQL) -> Resolver (Mapping) -> Service (Logic) -> Model (Data).
2. **Naming Convention**: Database menggunakan `snake_case`, API/GraphQL menggunakan `camelCase`. Service bertanggung jawab untuk transformasi ini.
3. **Security**: Selalu menggunakan *parameterized queries* pada model untuk mencegah SQL Injection.
4. **Resiliency**: Pengecekan status konektivitas node blockchain secara proaktif di layer service.
