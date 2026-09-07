# Fitur Token

Modul ini bertanggung jawab untuk menyediakan informasi mengenai aset token, seperti detail token (nama, simbol) dan aset visualnya (logo).

## Cara Kerja

Fitur ini diekspos melalui endpoint GraphQL. Ketika sebuah _request_ diterima untuk query `tokenAsset`, sistem akan melakukan langkah-langkah berikut:

1.  **Resolver** (`token.resolver.js`) menerima _request_ dan memanggil _service_ yang sesuai.
2.  **Service** (`token.service.js`) mengambil data token dari database melalui **model**.
3.  **Model** (`token.model.js`) melakukan _query_ ke tabel `tokens` di database berdasarkan alamat kontrak.
4.  **Service** kemudian memeriksa keberadaan file gambar logo di direktori `api/src/tokenAsset/image/`.
5.  Jika gambar ditemukan, _service_ akan membuat URL absolut ke gambar tersebut. Jika tidak, URL akan `null`.
6.  Terakhir, _service_ mengembalikan objek gabungan yang berisi informasi token dan URL logo ke _resolver_, yang kemudian diteruskan ke klien.

## Endpoint GraphQL

Satu-satunya _query_ yang tersedia di modul ini adalah `tokenAsset`.

### Query: `tokenAsset`

Mengambil informasi aset untuk sebuah token berdasarkan alamat kontraknya.

-   **Parameter**:
    -   `address` (String!): Alamat kontrak token yang ingin dicari.

-   **Mengembalikan**: `TokenAsset`
    -   Objek `TokenAsset` berisi:
        -   `address`: String!
        -   `name`: String
        -   `symbol`: String
        -   `decimals`: Int
        -   `tokenType`: String
        -   `logoUrl`: String (URL ke gambar logo, bisa `null`)

---

### Aturan Request

Untuk melakukan _request_, gunakan format GraphQL Query berikut.

**Contoh Request:**

```graphql
query GetTokenAsset($address: String!) {
  tokenAsset(address: $address) {
    address
    name
    symbol
    decimals
    tokenType
    logoUrl
  }
}
```

**Variables:**

```json
{
  "address": "0x....." // Ganti dengan alamat kontrak token yang valid
}
```

**Contoh Respons (Sukses):**

```json
{
  "data": {
    "tokenAsset": {
      "address": "0x...",
      "name": "Contoh Token",
      "symbol": "CTK",
      "decimals": 18,
      "tokenType": "ERC20",
      "logoUrl": "http://localhost:4000/images/0x....png"
    }
  }
}
```

**Contoh Respons (Token tidak ditemukan atau logo tidak ada):**

```json
{
  "data": {
    "tokenAsset": {
      "address": "0x...",
      "name": "Contoh Token",
      "symbol": "CTK",
      "decimals": 18,
      "tokenType": "ERC20",
      "logoUrl": null
    }
  }
}
```

## Aturan Penambahan Aset (Logo)

Agar logo token dapat ditampilkan, Anda harus menambahkan file gambar secara manual ke dalam sistem dengan aturan sebagai berikut:

1.  **Nama File**: Nama file harus sama dengan alamat kontrak token dalam format **lowercase** dan diakhiri dengan ekstensi `.png`.
    -   Contoh: Jika alamat kontrak `0xAbC123...`, nama filenya harus `0xabc123....png`.
2.  **Lokasi**: Simpan file gambar di direktori berikut:
    ```
    /api/src/tokenAsset/image/
    ```

Sistem akan secara otomatis mendeteksi file ini dan menyajikan URL-nya saat `tokenAsset` di-_query_.
