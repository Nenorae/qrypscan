# Rencana Pengembangan Fitur Token Lanjutan

Dokumen ini menguraikan rencana teknis untuk mengimplementasikan dua layanan token baru:
1.  **Layanan Discover**: Menyediakan daftar semua token yang terindeks untuk fitur penemuan di dompet.
2.  **Layanan Saldo Token**: Menampilkan semua token yang dimiliki oleh alamat tertentu beserta jumlah saldonya.

## 1. Analisis & Arsitektur yang Diusulkan

### Analisis
-   **Skema Database**: Tabel `tokens` yang ada sudah cukup untuk layanan "Discover" karena berisi semua metadata statis yang diperlukan (nama, simbol, alamat, dll.). Tabel `token_transfers` mencatat riwayat transaksi tetapi tidak efisien untuk menghitung saldo *real-time*.
-   **Kebutuhan Data Real-time**: Untuk mendapatkan saldo token (nominal) yang dimiliki sebuah alamat, permintaan harus dilakukan langsung ke blockchain melalui panggilan RPC (`eth_call` ke fungsi `balanceOf` pada kontrak token). Ini adalah satu-satunya sumber kebenaran untuk data yang terus berubah.

### Arsitektur Hybrid
Pendekatan terbaik adalah model hybrid yang Anda sarankan:
-   **API (GraphQL)**: Tetap menjadi pintu gerbang utama bagi klien.
-   **Database (PostgreSQL)**: Digunakan untuk mengambil data yang sudah diindeks dan bersifat statis (misalnya, daftar lengkap token, detail token).
-   **RPC Node**: Digunakan untuk mengambil data *on-chain* yang dinamis dan spesifik, seperti saldo token sebuah alamat.

```
+-----------+        +---------------------+        +---------------------------+
|           |        |                     |        |                           |
|  Client   |------> |  GraphQL API Server |------> |   Database (PostgreSQL)   |
| (Wallet)  |        |    (api)            |        | (Untuk data statis/list)  |
|           |        |                     |        |                           |
+-----------+        +---------------------+        +---------------------------+
                             |
                             | (eth_call)
                             |
                             v
                       +----------------+
                       |                |
                       | Blockchain RPC |
                       | Node           |
                       | (Untuk Saldo)  |
                       +----------------+
```

## 2. Rencana Implementasi

### Tahap 1: Implementasi Layanan Discover (`discoverTokens`)

Tujuan: Membuat query GraphQL baru yang mengembalikan semua token yang ada di database.

1.  **Schema (`token.schema.js`)**:
    -   Tambahkan query baru ke `extend type Query`.
    ```graphql
    extend type Query {
      tokenAsset(address: String!): TokenAsset
      discoverTokens: [TokenAsset!]
    }
    ```

2.  **Model (`token.model.js`)**:
    -   Buat fungsi baru `getAllTokens` untuk mengambil semua entri dari tabel `tokens`.
    ```javascript
    export async function getAllTokens() {
      logger.info(`[token.model.js] >> getAllTokens`);
      try {
        const query = `SELECT contract_address, name, symbol, decimals, token_type FROM tokens;`;
        const { rows } = await db.query(query);
        return rows.map(row => ({
          contractAddress: row.contract_address,
          name: row.name,
          symbol: row.symbol,
          decimals: row.decimals,
          tokenType: row.token_type,
        }));
      } catch (error) {
        logger.error(`[token.model.js] Gagal mengambil semua token:`, error);
        throw error;
      }
    }
    ```

3.  **Service (`token.service.js`)**:
    -   Buat fungsi `discoverTokens` yang memanggil `getAllTokens` dari model.
    -   Fungsi ini akan melakukan iterasi pada setiap token untuk menambahkan `logoUrl` (logika yang sama seperti di `getTokenAssetInfo`).
    ```javascript
    export async function discoverTokens() {
      logger.info(`[token.service.js] >> discoverTokens`);
      try {
        const allTokens = await tokenModel.getAllTokens();
        const tokensWithLogos = allTokens.map(tokenInfo => {
          const imageFileName = `${tokenInfo.contractAddress.toLowerCase()}.png`;
          const imageFilePath = path.join(IMAGE_ASSET_BASE_PATH, imageFileName);
          let imageUrl = null;
          if (fs.existsSync(imageFilePath)) {
            const apiHost = process.env.API_HOST || "http://localhost";
            const apiPort = config.port;
            imageUrl = `${apiHost}:${apiPort}/images/${imageFileName}`;
          }
          return {
            address: tokenInfo.contractAddress,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals,
            tokenType: tokenInfo.tokenType,
            logoUrl: imageUrl,
          };
        });
        return tokensWithLogos;
      } catch (error) {
        logger.error(`[token.service.js] Gagal memproses discoverTokens:`, error);
        throw error;
      }
    }
    ```

4.  **Resolver (`token.resolver.js`)**:
    -   Tambahkan resolver untuk `discoverTokens`.
    ```javascript
    export const resolvers = {
      Query: {
        // ... resolver tokenAsset yang sudah ada
        discoverTokens: async () => {
          logger.info(`[token.resolver.js] >> Query.discoverTokens`);
          return tokenService.discoverTokens();
        },
      },
    };
    ```

### Tahap 2: Implementasi Layanan Saldo Token (`getAddressTokenBalances`)

Tujuan: Membuat query GraphQL yang menerima alamat wallet dan mengembalikan daftar token yang dimilikinya beserta saldonya.

1.  **Buat Koneksi ke RPC Node**:
    -   Kita memerlukan *library* seperti `ethers.js` atau `web3.js` untuk berinteraksi dengan node. `ethers.js` lebih modern.
    -   Tambahkan `ethers` ke `package.json` di direktori `api`.
    -   Buat sebuah *helper/core service*, misalnya di `api/src/core/blockchain.js`, untuk mengelola koneksi provider RPC.
    -   URL RPC node harus diambil dari variabel lingkungan (`process.env.RPC_URL`).

2.  **Schema (`token.schema.js`)**:
    -   Definisikan tipe baru `AddressTokenBalance` yang menggabungkan `TokenAsset` dengan saldo.
    -   Tambahkan query `getAddressTokenBalances`.
    ```graphql
    type AddressTokenBalance {
      token: TokenAsset!
      balance: String! # Saldo dalam format string untuk presisi tinggi (uint256)
    }

    extend type Query {
      # ... query lainnya
      getAddressTokenBalances(address: String!): [AddressTokenBalance!]
    }
    ```

3.  **Logika Layanan (`token.service.js`)**:
    -   Buat fungsi `getAddressTokenBalances(address)`.
    -   **Langkah A**: Dapatkan daftar token yang *pernah* berinteraksi dengan alamat tersebut. Ini untuk optimasi agar tidak memeriksa setiap token di blockchain.
        -   Query ke tabel `token_transfers` untuk mendapatkan `DISTINCT contract_address` `WHERE from_address = $1 OR to_address = $1`.
    -   **Langkah B**: Untuk setiap alamat kontrak token yang ditemukan:
        -   Gunakan *provider* RPC (`ethers.js`) untuk memanggil fungsi `balanceOf(address)` dari kontrak token tersebut.
        -   Gunakan `getTokenAssetInfo` yang sudah ada untuk mendapatkan metadata token (nama, simbol, logo).
    -   **Langkah C**: Filter hasilnya. Hanya sertakan token di mana saldonya lebih besar dari 0.
    -   Gabungkan data dan kembalikan dalam format `AddressTokenBalance`.

4.  **Resolver (`token.resolver.js`)**:
    -   Tambahkan resolver untuk `getAddressTokenBalances` yang memanggil fungsi servis yang baru.

## 3. Ringkasan File yang Akan Diubah/Dibuat

-   **`api/package.json`**: Tambah dependensi `ethers`.
-   **`api/src/features/token/token.schema.js`**: (Modifikasi) Menambah tipe dan query baru.
-   **`api/src/features/token/token.model.js`**: (Modifikasi) Menambah fungsi `getAllTokens`.
-   **`api/src/features/token/token.service.js`**: (Modifikasi) Menambah `discoverTokens` dan `getAddressTokenBalances`, serta logika RPC.
-   **`api/src/features/token/token.resolver.js`**: (Modifikasi) Menambah resolver baru.
-   **`api/src/core/blockchain.js`**: (File Baru) Utilitas untuk koneksi ke RPC node.
-   **`.env.example`**: Tambahkan `RPC_URL`.


Anda benar sekali, pernyataan itu sangat tepat.


  Untuk kasus Anda yang hanya memiliki satu "Rupiah Token" dan tidak ada niat untuk menambah token lain, nama, simbol, desimal, dan
  bahkan URL logo bisa dan sebaiknya di-hardcode langsung di kode aplikasi (atau di file konfigurasi, yang intinya sama dengan
  hardcode karena tidak diambil secara dinamis dari sumber eksternal).

  Mengapa Pendekatan Ini Benar:


   1. Metadata Statis: Informasi seperti nama token ("Rupiah Token"), simbol ("IDRT"), dan jumlah desimal (decimals) adalah data
      statis yang ditentukan saat kontrak token Anda di-deploy. Mereka tidak akan pernah berubah.
   2. Logo Statis: Jika Anda menggunakan satu logo tetap untuk token ini, URL-nya juga statis.
   3. Efisiensi: Menghindari query database atau panggilan on-chain untuk data yang tidak pernah berubah akan membuat API Anda jauh
      lebih cepat dan mengurangi beban server/database.
   4. Sumber Kebenaran Terpusat: Satu-satunya hal yang benar-benar dinamis dan harus diambil dari blockchain adalah saldo (balance)
      token yang dimiliki oleh suatu alamat. Informasi ini memang hanya ada di blockchain.

  Bagaimana Ini Cocok dengan Rencana Sebelumnya:


  Rencana refactor yang saya usulkan untuk token.service.js sebenarnya sudah mengadopsi pendekatan ini. Di sana, kita
  menginisialisasi rupiahTokenData dengan nilai-nilai hardcode untuk name, symbol, decimals, dll.


    1 // Contoh dari rencana sebelumnya:
    2 const rupiahTokenData = {
    3   address: RUPIAH_TOKEN_ADDRESS,
    4   name: "Rupiah Token",
    5   symbol: "IDRT", // Nilai hardcode
    6   decimals: 2, // Nilai hardcode
    7   tokenType: "ERC20",
    8   logoUrl: imageUrl, // URL logo yang juga akan statis atau di-hardcode
    9 };
   10 return rupiahTokenData;


  Jadi, memang hanya "nilai" atau lebih tepatnya jumlah saldo token yang dimiliki oleh setiap alamat pengguna yang harus diambil
  secara real-time dari blockchain melalui panggilan RPC. Semua metadata lain untuk Rupiah Token Anda akan di-hardcode.


  Pendekatan ini adalah yang paling efisien dan paling bersih untuk kasus penggunaan Anda yang spesifik.