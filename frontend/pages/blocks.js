// File: frontend/pages/blocks.js

import { gql } from "@apollo/client";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import client from "../lib/api";

// Query GraphQL untuk mengambil data blok per halaman
const GET_BLOCKS_PAGINATED = gql`
  query GetBlocksPaginated($page: Int, $limit: Int) {
    blocksPaginated(page: $page, limit: $limit) {
      totalCount
      blocks {
        number
        hash
        timestamp
        transactionCount
        miner
      }
    }
  }
`;

// Helper untuk memotong hash
const truncateHash = (hash) => (hash ? `${hash.substring(0, 10)}...${hash.substring(hash.length - 10)}` : "N/A");

export default function AllBlocksPage({ initialData }) {
  const router = useRouter();
  const [searchBlock, setSearchBlock] = useState("");

  const currentPage = parseInt(router.query.page || "1", 10);
  const totalPages = Math.ceil(initialData.totalCount / 20);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchBlock) {
      router.push(`/block/${searchBlock}`);
    }
  };

  return (
    <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
      <Head>
        <title>Semua Blok - Halaman {currentPage}</title>
      </Head>

      <header className="mb-8">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
          &larr; Kembali ke Halaman Utama
        </Link>
        <h1 className="text-4xl font-bold mt-4 text-gray-800 dark:text-gray-100">Daftar Semua Blok</h1>
        <p className="text-gray-600 dark:text-gray-300">Total {initialData.totalCount} blok telah ditemukan.</p>
      </header>

      {/* Search Bar Khusus Blok */}
      <form onSubmit={handleSearch} className="flex gap-4 mb-8">
        <input 
          type="number" 
          value={searchBlock} 
          onChange={(e) => setSearchBlock(e.target.value)} 
          placeholder="Lompat ke blok #" 
          className="flex-grow p-3 text-base rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
        <button 
          type="submit" 
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Cari Blok
        </button>
      </form>

      {/* Tabel Data Blok */}
      <div className="overflow-x-auto bg-white rounded-lg shadow-lg dark:bg-gray-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              <th className="p-3 border border-gray-300 text-left dark:border-gray-600">Nomor Blok</th>
              <th className="p-3 border border-gray-300 text-left dark:border-gray-600">Hash</th>
              <th className="p-3 border border-gray-300 text-left dark:border-gray-600">Penambang</th>
              <th className="p-3 border border-gray-300 text-center dark:border-gray-600">Tx Count</th>
              <th className="p-3 border border-gray-300 text-left dark:border-gray-600">Waktu</th>
            </tr>
          </thead>
          <tbody>
            {initialData.blocks.map((block) => (
              <tr key={block.number} className="bg-white border-b border-gray-200 hover:bg-gray-50 transition-colors dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                <td className="p-3 border border-gray-300 dark:border-gray-700">
                  <Link href={`/block/${block.number}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    {block.number}
                  </Link>
                </td>
                <td className="p-3 border border-gray-300 font-mono text-gray-700 dark:border-gray-700 dark:text-gray-300">{truncateHash(block.hash)}</td>
                <td className="p-3 border border-gray-300 font-mono text-gray-700 dark:border-gray-700 dark:text-gray-300">{truncateHash(block.miner)}</td>
                <td className="p-3 border border-gray-300 text-center text-gray-700 dark:border-gray-700 dark:text-gray-300">{block.transactionCount}</td>
                <td className="p-3 border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300">{new Date(parseInt(block.timestamp) * 1000).toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kontrol Pagination */}
      <div className="mt-8 flex justify-between items-center text-gray-600 dark:text-gray-300">
        <Link 
          href={`/blocks?page=${Math.max(1, currentPage - 1)}`} 
          className={`px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 hover:text-gray-700 transition-colors dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100 ${currentPage <= 1 ? "opacity-50 cursor-not-allowed" : "text-blue-600 dark:text-blue-400"}`}
        >
          &larr; Sebelumnya
        </Link>
        <span>
          Halaman {currentPage} dari {totalPages}
        </span>
        <Link
          href={`/blocks?page=${Math.min(totalPages, currentPage + 1)}`}
          className={`px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 hover:text-gray-700 transition-colors dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100 ${currentPage >= totalPages ? "opacity-50 cursor-not-allowed" : "text-blue-600 dark:text-blue-400"}`}
        >
          Selanjutnya &rarr;
        </Link>
      </div>
    </div>
  );
}

// Mengambil data di sisi server
export async function getServerSideProps(context) {
  const page = parseInt(context.query.page || "1", 10);
  const limit = 20;

  try {
    const { data } = await client.query({
      query: GET_BLOCKS_PAGINATED,
      variables: { page, limit },
      // Penting: 'network-only' agar tidak menggunakan cache saat berpindah halaman
      fetchPolicy: "network-only",
    });

    return {
      props: {
        initialData: data.blocksPaginated,
      },
    };
  } catch (error) {
    console.error("Gagal mengambil data blok:", error);
    return {
      props: {
        initialData: { blocks: [], totalCount: 0 },
      },
    };
  }
}
