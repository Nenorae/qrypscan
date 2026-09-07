# Dokumentasi Teknis: Frontend Components Module

Dokumen ini merinci arsitektur dan implementasi komponen antarmuka pengguna pada repositori `frontend/components`. Frontend dibangun menggunakan **Next.js**, **Apollo Client** (GraphQL), **Tailwind CSS**, dan **Ethers.js** untuk interaksi blockchain.

---

## 1. Komponen Inti Kontrak (`/ContractDetails.js`, `/ContractInteractor.js`)

Komponen-komponen ini menangani visualisasi data kontrak pintar dan interaksi langsung dengan fungsi-fungsinya.

### A. `ContractDetails.js`
Komponen ini bertindak sebagai orkestrator utama untuk halaman detail kontrak.
- **State Management**: Menangani tab navigasi (Contract, Transactions, Read/Write).
- **Proxy Handling**: Menyertakan `ProxyInfoBanner` yang secara dinamis menampilkan tautan ke alamat implementasi jika kontrak terdeteksi sebagai proxy.
- **Verification Support**: 
    - `VerifiedInfo`: Menampilkan kode sumber via `SourceCodeViewer` dan antarmuka interaksi.
    - `UnverifiedInfo`: Menyediakan instruksi verifikasi via Hardhat dan form `ProxyVerificationForm` untuk menautkan proxy secara manual.
- **Mutation**: Menggunakan `VERIFY_PROXY_MUTATION` untuk mengirimkan data penautan proxy ke backend.

### B. `ContractInteractor.js`
Menyediakan antarmuka untuk memanggil fungsi *Read* (view/pure) dan *Write* pada kontrak.
- **Provider Logic**: 
    - Fungsi *Read* menggunakan `JsonRpcProvider` statis untuk performa cepat tanpa perlu koneksi dompet.
    - Fungsi *Write* menggunakan `BrowserProvider` (MetaMask) untuk otorisasi transaksi.
- **Dynamic Form Generation**: Mengiterasi fragment ABI untuk menghasilkan input field sesuai tipe data Solidity (address, uint256, dll).
- **Payable Handling**: Mendeteksi fungsi `payable` dan menambahkan input field tambahan untuk nilai ETH yang akan dikirim.

---

## 2. Visualisasi Data & Navigasi (`/SourceCodeViewer.js`, `/TransactionList.js`)

### A. `SourceCodeViewer.js`
- **Multi-file Support**: Mengelola tampilan banyak file sumber kontrak (biasanya dari Standard JSON Input).
- **Syntax Highlighting**: Menggunakan `react-syntax-highlighter` dengan tema yang sinkron terhadap `ThemeContext` (Dark/Light mode).

### B. `TransactionList.js`
- **Contextual Query**: Mengambil daftar transfer token khusus untuk kontrak tertentu menggunakan query `transactionsByContractAddress`.
- **Formatting**: Melakukan pemotongan (*truncation*) hash dan alamat untuk menjaga tampilan tabel tetap bersih pada layar kecil.

---

## 3. Komponen Dashboard & Real-time (`/LatestBlocks.js`, `/LatestTransactions.js`)

- **Polling Strategy**: Kedua komponen ini menggunakan fitur `pollInterval: 4000` dari Apollo Client untuk memperbarui data secara otomatis setiap 4 detik tanpa *page reload*.
- **Visual Feedback**: Menyediakan indikator *loading* dan *error state* yang konsisten.
- **Time Formatting**: `LatestBlocks` menyertakan utilitas `timeAgo` untuk menghitung waktu relatif sejak blok ditambang.

---

## 4. Utilitas Pencarian & Tata Letak (`/SearchBar.js`, `/layout/`)

### A. `SearchBar.js`
Mengimplementasikan logika *intelligent routing* berbasis pola input:
1. **Address (42 chars)**: Mengarahkan ke `/address/[address]`.
2. **Transaction Hash (66 chars)**: Mengarahkan ke `/tx/[hash]`.
3. **Block Number (Numeric only)**: Mengarahkan ke `/block/[number]`.
- **Validation**: Menggunakan regex `^\d+$` untuk memastikan input nomor blok murni angka sebelum melakukan *routing*.

### B. `layout/Header.js` & `Footer.js`
- **Theme Integration**: `Header.js` terintegrasi dengan `ThemeContext` untuk menyediakan sakelar mode gelap/terang.
- **Responsive Design**: Menggunakan Tailwind CSS untuk memastikan navigasi tetap fungsional di perangkat seluler.

---

## Standar Teknis & Integrasi
1. **GraphQL Integration**: Semua komponen data-driven menggunakan `useQuery` atau `useMutation` dari `@apollo/client`.
2. **Theming**: Konsistensi warna menggunakan utility classes Tailwind (`dark:bg-gray-800`, `dark:text-gray-100`) yang merespon perubahan state pada `ThemeContext`.
3. **Blockchain Interaction**: Penggunaan `ethers.js` versi 6 untuk parsing ABI dan enkapsulasi logika transaksi on-chain.
4. **Link Optimization**: Penggunaan komponen `Link` dari Next.js untuk navigasi antar halaman yang cepat (client-side routing).
