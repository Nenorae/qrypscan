# Penanganan Verifikasi Kontrak Hardhat

API ini menyediakan endpoint yang kompatibel dengan Etherscan untuk memungkinkan verifikasi source code kontrak pintar langsung dari lingkungan Hardhat.

## Ringkasan Alur Kerja

Mekanisme ini meniru cara kerja verifikasi Etherscan, memungkinkan developer untuk mengintegrasikan proses verifikasi mereka dengan mulus ke dalam alur kerja Hardhat yang sudah ada.

1.  **Inisiasi dari Hardhat**: Developer menjalankan perintah `npx hardhat verify` pada proyek mereka.
2.  **Konfigurasi Hardhat**: Plugin `hardhat-etherscan` membaca konfigurasi `etherscan` di file `hardhat.config.js` untuk menemukan URL API kustom dan `apiKey` (meskipun tidak digunakan, tetap diperlukan).
3.  **Pengiriman Permintaan**: Hardhat mengirimkan permintaan `POST` ke endpoint `/api` pada server ini. *Body* dari permintaan tersebut berisi data yang diperlukan untuk verifikasi, seperti alamat kontrak, source code Solidity, versi compiler, dan argumen constructor (jika ada).
4.  **Penanganan oleh API**:
    *   Endpoint `POST /api` di `src/core/server.js` menerima permintaan tersebut.
    *   Permintaan diteruskan ke service `handleHardhatVerification` di `src/features/contracts/contract.service.js`.
    *   Service ini akan mengkompilasi ulang source code yang diterima dan membandingkan bytecode yang dihasilkan dengan bytecode yang ada di alamat kontrak on-chain (diambil melalui `rpcUrl` yang dikonfigurasi di `.env`).
5.  **Penyimpanan Hasil**: Jika bytecode cocok, source code, ABI, dan status "terverifikasi" akan disimpan ke dalam database PostgreSQL.
6.  **Respons ke Hardhat**: API mengirimkan respons kembali ke Hardhat. Jika berhasil, Hardhat akan menampilkan pesan sukses di terminal pengguna.

## Konfigurasi pada `hardhat.config.js`

Untuk menggunakan fitur verifikasi ini, konfigurasikan file `hardhat.config.js` atau `hardhat.config.ts` di proyek Anda seperti berikut:

```javascript
// hardhat.config.js

require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    // ... konfigurasi network Anda yang lain
    besu: {
      url: process.env.BESU_RPC_URL || "http://127.0.0.1:8545",
      accounts: [process.env.PRIVATE_KEY]
    }
  },
  etherscan: {
    // apiKey bisa diisi string apapun, karena tidak divalidasi.
    // Namun, field ini wajib ada.
    apiKey: {
      besu: "any-string-will-do"
    },
    customChains: [
      {
        network: "besu",
        chainId: parseInt(process.env.CHAIN_ID || "1337"),
        urls: {
          // URL tempat API verifikasi ini berjalan
          apiURL: "http://localhost:4000/api", // Ganti dengan URL API Anda
          browserURL: "http://localhost:3000" // URL block explorer (opsional)
        }
      }
    ]
  }
};
```

### Detail Penting:

-   **`etherscan.apiKey`**: Meskipun API ini tidak menggunakan API key, plugin Hardhat mengharuskan field ini ada. Anda bisa mengisinya dengan string acak.
-   **`etherscan.customChains`**: Bagian ini sangat penting. Anda harus mendefinisikan `network` yang cocok dengan nama network yang Anda gunakan di Hardhat (`besu` dalam contoh ini).
-   **`urls.apiURL`**: Ini adalah URL absolut ke endpoint verifikasi pada API ini. Pastikan port dan alamatnya benar.
-   **`urls.browserURL`**: URL ke frontend block explorer Anda, tempat pengguna bisa melihat kontrak yang sudah terverifikasi.

## Endpoint API

-   **`POST /api`**
    -   Menerima data verifikasi kontrak dari Hardhat.
    -   Menggunakan `Content-Type: application/x-www-form-urlencoded`.
    -   Menjalankan logika verifikasi dan menyimpan hasilnya.
-   **`GET /api`**
    -   Digunakan oleh Hardhat untuk memeriksa status verifikasi atau GUID.
    -   Merespons dengan status yang sesuai jika verifikasi sedang diproses atau sudah selesai.
