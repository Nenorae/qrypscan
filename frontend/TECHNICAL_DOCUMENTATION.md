# Dokumentasi Teknis: Frontend Core & Pages

Dokumen ini merinci infrastruktur inti dan logika halaman pada repositori `frontend`. Frontend ini dirancang menggunakan **Next.js** dengan fokus pada **Server-Side Rendering (SSR)** untuk data blockchain yang konsisten dan performa SEO yang optimal.

---

## 1. Infrastruktur Inti (`/context` & `/lib`)

### A. Global State: Theme Management (`/context/ThemeContext.js`)
Mengelola sistem tema (Dark/Light Mode) aplikasi secara menyeluruh.
- **Hydration Safety**: Menggunakan state `mounted` untuk memastikan transisi tema hanya terjadi setelah komponen di-mount di sisi klien. Hal ini mencegah perbedaan *class* antara server (SSR) dan klien (Hydration error).
- **Persistence**: Menyimpan pilihan pengguna di `localStorage`.
- **System Preference**: Mendeteksi preferensi sistem (`prefers-color-scheme: dark`) sebagai fallback awal.

### B. API Client Configuration (`/lib/api.js`)
Konfigurasi terpusat untuk komunikasi GraphQL.
- **Apollo Client**: Menggunakan `HttpLink` untuk menghubungkan ke API server.
- **Environment Variable**: Menggunakan `NEXT_PUBLIC_GRAPHQL_API_URL` dengan fallback otomatis ke alamat IP internal pengembangan.
- **Caching**: Menggunakan `InMemoryCache` untuk mengoptimalkan navigasi antar halaman.

---

## 2. Struktur Halaman & Logika Routing (`/pages`)

Aplikasi ini menggunakan pola **Server-Side Rendering (SSR)** via `getServerSideProps` pada hampir setiap halaman dinamis.

### A. Entry Point & Layout (`_app.js`)
- Membungkus seluruh aplikasi dengan `ThemeProvider` dan `ApolloProvider`.
- Mendefinisikan struktur tata letak global yang mencakup `Header`, `Main`, dan `Footer`.

### B. Halaman Detail Alamat (`address/[address].js`)
- **Address Validation**: Menggunakan `ethers.isAddress` untuk validasi format sebelum melakukan query.
- **Intelligent Redirect**: Jika alamat yang di-query terdeteksi sebagai kontrak di database, halaman akan melakukan *redirect* otomatis ke `/contract/[address]`.
- **Agregasi Data**: Menampilkan saldo (diformat via `ethers.formatEther`) dan daftar transaksi terkait secara bersamaan.

### C. Halaman Detail Blok (`block/[blockNumber].js` & `blocks.js`)
- **SSR Fetching**: Mengambil data detail blok berdasarkan nomor integer.
- **Hydration Fix**: Menggunakan komponen `TimestampCell` atau `useEffect` di sisi klien untuk memformat waktu (`toLocaleString`). Ini penting untuk menghindari *mismatch* zona waktu antara server dan browser pengguna.
- **Pagination**: Halaman `blocks.js` mendukung navigasi halaman via query parameter `?page=x`.

### D. Halaman Detail Kontrak (`contract/[address].js` & `contracts.js`)
- **Verification Logic**: Menentukan apakah harus menampilkan komponen `VerifiedInfo` (kode sumber + ABI) atau `UnverifiedInfo` (form verifikasi/link proxy) berdasarkan flag `isVerified` dari API.
- **Proxy Tracking**: Mendukung tampilan label `PROXY` pada daftar kontrak jika metadata menunjukkan adanya alamat implementasi.

### E. Halaman Detail Transaksi (`tx/[txHash].js`)
- **Double-Pass Query**: 
    1. Mencari alamat `to` dari transaksi.
    2. Mencari ABI kontrak pada alamat `to` tersebut.
- **Input Data Decoding**: Menggunakan `ethers.Interface` untuk mencoba men-decode `inputData` mentah. Jika ABI cocok, sistem akan menampilkan nama fungsi dan argumen yang dipanggil secara terstruktur; jika tidak, akan ditampilkan sebagai data mentah hex.

---

## 3. Karakteristik Teknis & Pola Pengembangan

### A. Pola Server-Side Rendering (SSR)
Setiap halaman dinamis mengekspor fungsi `getServerSideProps`. Keuntungan utama:
- **Data Freshness**: Data blockchain diambil pada saat request, menjamin konsistensi informasi blok terbaru.
- **SEO & Social Preview**: Informasi seperti hash transaksi atau alamat kontrak tersedia di level HTML mentah untuk crawler.

### B. Integrasi Ethers.js
`ethers.js` v6 digunakan secara luas di seluruh halaman untuk:
- Validasi alamat Ethereum.
- Formatting nilai (Wei ke Ether).
- Parsing ABI dan decoding transaksi administratif/interaksi.

### C. Navigasi & UX
- **Dynamic Title**: Judul halaman (`<Head><title>...`) diperbarui secara dinamis menggunakan data dari SSR untuk meningkatkan keterbacaan pada tab browser.
- **Mono Font**: Alamat hex dan hash selalu dibungkus dalam kelas `font-mono` untuk memastikan penjajaran karakter yang rapi pada tabel.
- **Dark Mode CSS**: Menggunakan utility Tailwind `dark:` yang terintegrasi dengan `ThemeContext` pada setiap halaman untuk dukungan mode malam yang mulus.
