# Dokumentasi Teknis: Indexer Jobs

Modul ini berisi tugas-tugas latar belakang (*background jobs*) yang berjalan secara periodik untuk menjaga validitas data di database Indexer.

---

## 1. Proxy Rechecker Job (`proxyRecheckerJob.js`)

Pekerjaan ini bertanggung jawab untuk memantau status kontrak proxy yang sudah terdaftar di database dan mendeteksi perubahan implementasi atau admin secara proaktif.

### A. Mekanisme Operasional
- **Interval**: Berjalan setiap 10 menit (default) atau sesuai nilai `PROXY_RECHECK_INTERVAL_MS` di file `.env`.
- **Workflow**:
    1. Mengambil semua kontrak dari database yang memiliki flag `is_proxy = TRUE`.
    2. Untuk setiap kontrak, menjalankan `detectProxyContract` (dari modul `/processors/proxyDetection/`) terhadap blockchain.
    3. Membandingkan hasil deteksi terbaru (implementasi, admin, tipe proxy) dengan data di database.
    4. Jika terdeteksi perbedaan (misal: alamat implementasi berubah), sistem akan memperbarui baris terkait di tabel `contracts`.

### B. Signifikansi Teknis
- **Upgrade Detection**: Memastikan QrypScan selalu menampilkan alamat implementasi yang benar dan terbaru, bahkan jika event upgrade terlewatkan selama pemindaian awal atau terjadi pembaruan di luar mekanisme log standar.
- **Data Integrity**: Menjaga sinkronisasi antara *state* on-chain dan data *off-chain* di database.

---

## 2. Manajemen & Graceful Shutdown
- **Singleton Pool**: Menggunakan pool koneksi database yang sama dengan indexer utama melalui `getDbPool()`.
- **Graceful Shutdown**: Mendengarkan signal `SIGINT` untuk menutup pool koneksi database secara bersih sebelum proses berhenti, mencegah kebocoran koneksi.

---

## Cara Menjalankan
Pekerjaan ini biasanya dijalankan sebagai proses terpisah atau menggunakan manajer proses seperti PM2:

```bash
node indexer/src/jobs/proxyRecheckerJob.js
```
