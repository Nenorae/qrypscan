// File: frontend/components/SearchBar.js (Versi Perbaikan)
import { useState } from  "react";
import { useRouter } from "next/router";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return;

    // --- LOGIKA BARU YANG LEBIH BAIK ---

    // 1. Cek format hash (dimulai dengan 0x) terlebih dahulu
    if (trimmedQuery.startsWith("0x")) {
      if (trimmedQuery.length === 42) {
        // Panjang alamat Ethereum
        router.push(`/address/${trimmedQuery}`);
        return;
      }
      if (trimmedQuery.length === 66) {
        // Panjang hash transaksi
        router.push(`/tx/${trimmedQuery}`);
        return;
      }
    }

    // 2. Jika bukan format hash, baru cek apakah ini murni angka (nomor blok)
    //    Menggunakan regular expression /^\d+$/ adalah cara paling aman
    if (/^\d+$/.test(trimmedQuery)) {
      router.push(`/block/${trimmedQuery}`);
      return;
    }

    // 3. Jika tidak cocok semua kriteria
    alert("Input tidak valid. Masukkan Nomor Blok, Alamat, atau Hash Transaksi yang benar.");
  };

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-4 mb-4">
        <input 
          type="text" 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          placeholder="Cari berdasarkan Nomor Blok / Alamat / Hash Transaksi" 
          className="flex-grow p-3 text-base rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
        <button 
          type="submit" 
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Cari
        </button>
      </form>

    </div>
  );
}