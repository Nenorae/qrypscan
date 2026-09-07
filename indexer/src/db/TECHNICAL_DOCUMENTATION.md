# Dokumentasi Teknis: Indexer Database Module

Dokumen ini merinci arsitektur, skema database, dan lapisan akses data (queries) yang digunakan oleh komponen Indexer. Sistem ini dioptimalkan untuk performa tinggi menggunakan **TimescaleDB** untuk manajemen data *time-series*.

---

## 1. Konektivitas Database (`connect.js`)

Indexer berinteraksi dengan PostgreSQL menggunakan library `pg` dengan pola **Lazy Initialization Singleton**:
- **`getDbPool()`**: Memastikan hanya ada satu instance `Pool` koneksi yang dibuat selama *lifecycle* aplikasi.
- **Konfigurasi**: Mengambil kredensial dari variabel lingkungan (`DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PASSWORD`, `DB_PORT`).
- **Event Handling**: Memantau event `connect` dan `error` pada setiap client untuk tujuan debugging dan stabilitas.

---

## 2. Arsitektur Skema (`schemas/`)

Database dirancang menggunakan **TimescaleDB** untuk menangani volume data blockchain yang masif secara efisien.

### A. Core Tables (`01_tables.sql`)
- **`blocks` & `transactions`**: Tabel utama penyimpan data mentah blockchain.
- **`event_logs`**: Tabel untuk menyimpan log event (topics & data).
- **`contracts` & `tokens`**: Registri untuk alamat kontrak dan metadata token.
- **`token_transfers`**: Tabel khusus untuk melacak perpindahan aset (ERC20, ERC721, ERC1155).

### B. TimescaleDB Setup (`02_timescaledb_setup.sql`)
- **Hypertables**: Tabel `blocks`, `transactions`, `token_transfers`, dan `event_logs` dikonversi menjadi *hypertables* dengan partisi otomatis berbasis `block_timestamp` (interval 1 hari).
- **Compression Policies**: Data otomatis dikompresi setelah 7 hari untuk menghemat ruang penyimpanan hingga 90%+.
- **Retention Policies**: Kebijakan retensi otomatis menghapus data mentah yang lebih tua dari 1 tahun untuk menjaga performa.

### C. Integritas & Analisis (`04_functions_and_triggers.sql`, `05_views.sql`)
- **Validation**: Fungsi `validate_ethereum_address` dan trigger `validate_transaction_integrity` memastikan data yang masuk sesuai standar Ethereum.
- **Continuous Aggregates**: Menggunakan *Materialized Views* (`daily_blockchain_stats`, `hourly_transaction_stats`) yang di-refresh secara otomatis untuk statistik performa blockchain tanpa membebani tabel utama.

---

## 3. Lapisan Query (`queries/`)

Query dipisahkan berdasarkan domain fungsional untuk memudahkan pemeliharaan:

- **`block.js`**: Menangani penyimpanan blok (`saveBlock`) dan logika pemrosesan blok beserta transaksi di dalamnya (`processBlock`).
- **`transaction.js`**: Mengelola penyimpanan transaksi (`saveTransaction`) dan pembaruan receipt (`updateTransactionReceipt`). Mendukung pemrosesan batch untuk efisiensi.
- **`contract.js`**: Menyimpan kontrak baru dan mengintegrasikan deteksi proxy secara otomatis saat kontrak pertama kali ditemukan.
- **`token.js`**: Menyimpan metadata token dan transfer token. Mendukung `batchProcessTokenTransfers`.
- **`proxy.js`**: Menangani logika spesifik proxy seperti pembaruan implementasi, pencatatan riwayat upgrade, Diamond facets (EIP-2535), dan informasi Beacon.
- **`log.js`**: Penyimpanan log event mentah ke tabel `event_logs`.

---

## 4. Manajemen Skema

Untuk melakukan setup awal atau reset database, gunakan skrip shell yang tersedia:

```bash
# Jalankan skrip ini dari folder indexer/src/db
./run_schemas.sh
```

Skrip ini akan mengeksekusi file SQL secara berurutan:
1. `00_cleanup.sql`: Menghapus objek database lama (opsional/hati-hati).
2. `01_tables.sql`: Membuat tabel-tabel inti.
3. `02_timescaledb_setup.sql`: Mengaktifkan fitur TimescaleDB.
4. `03_indexes.sql`: Membuat indeks performa.
5. `04_functions_and_triggers.sql`: Memasang fungsi validasi dan trigger.
6. `05_views.sql`: Membuat view dan statistik.
7. `06_roles_and_permissions.sql`: Mengatur hak akses pengguna.

---

## Standar Penulisan Query
1. **Transaction Support**: Operasi batch (seperti pemrosesan blok atau transfer token) harus dibungkus dalam transaksi database (`BEGIN`, `COMMIT`, `ROLLBACK`) untuk menjaga konsistensi.
2. **Conflict Handling**: Menggunakan `ON CONFLICT (...) DO NOTHING` atau `DO UPDATE` secara ekstensif untuk mencegah error akibat data ganda (*idempotency*).
3. **Type Safety**: Selalu melakukan konversi tipe data (misal: `BIGINT`, `NUMERIC` untuk nilai wei/gas) untuk menghindari presisi yang hilang.
