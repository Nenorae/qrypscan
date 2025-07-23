// File: frontend/pages/transactions.js

import { gql } from "@apollo/client";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import client from "../lib/api";

// Query GraphQL untuk mengambil data transaksi per halaman
const GET_TRANSACTIONS_PAGINATED = gql`
  query GetTransactionsPaginated($page: Int, $limit: Int) {
    transactionsPaginated(page: $page, limit: $limit) {
      totalCount
      transactions {
        hash
        blockNumber
        fromAddress
        toAddress
        value
      }
    }
  }
`;

// Helper untuk memotong hash
const truncateHash = (hash) => (hash ? `${hash.substring(0, 10)}...${hash.substring(hash.length - 10)}` : "N/A");

export default function AllTransactionsPage({ initialData }) {
  const router = useRouter();
  const currentPage = parseInt(router.query.page || "1", 10);
  
  // Periksa apakah initialData ada sebelum menghitung totalPages
  const totalPages = initialData ? Math.ceil(initialData.totalCount / 20) : 0;

  // Tampilan jika data tidak ada atau kosong
  if (!initialData || !initialData.transactions || initialData.transactions.length === 0) {
    return (
      <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
        <Head>
          <title>Semua Transaksi - QrypScan</title>
        </Head>
        <header className="mb-8">
          <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
            &larr; Kembali ke Halaman Utama
          </Link>
          <h1 className="text-4xl font-bold mt-2 text-gray-800 dark:text-gray-100">Daftar Semua Transaksi</h1>
        </header>
        <p className="text-gray-600 dark:text-gray-300">Tidak ada transaksi untuk ditampilkan.</p>
      </div>
    );
  }

  return (
    <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
      <Head>
        <title>Semua Transaksi - Halaman {currentPage} | QrypScan</title>
      </Head>

      <header className="mb-8">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
          &larr; Kembali ke Halaman Utama
        </Link>
        <h1 className="text-4xl font-bold mt-2 text-gray-800 dark:text-gray-100">Daftar Semua Transaksi</h1>
        <p className="text-lg text-gray-600 mt-1 dark:text-gray-300">Total {initialData.totalCount} transaksi telah ditemukan.</p>
      </header>

      {/* Tabel Data Transaksi */}
      <div className="overflow-x-auto shadow-md rounded-lg bg-white dark:bg-gray-800">
        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-300">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-200">
            <tr>
              <th scope="col" className="px-6 py-3">Hash</th>
              <th scope="col" className="px-6 py-3">Blok</th>
              <th scope="col" className="px-6 py-3">Dari</th>
              <th scope="col" className="px-6 py-3">Ke</th>
              <th scope="col" className="px-6 py-3">Value (wei)</th>
            </tr>
          </thead>
          <tbody>
            {initialData.transactions.map((tx) => (
              <tr key={tx.hash} className="bg-white border-b border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                <td className="px-6 py-4 font-mono text-blue-600 hover:underline dark:text-blue-400">
                  <Link href={`/tx/${tx.hash}`}>{truncateHash(tx.hash)}</Link>
                </td>
                <td className="px-6 py-4 text-blue-600 hover:underline dark:text-blue-400">
                   <Link href={`/block/${tx.blockNumber}`}>{tx.blockNumber}</Link>
                </td>
                <td className="px-6 py-4 font-mono text-blue-600 hover:underline dark:text-blue-400">
                  <Link href={`/address/${tx.fromAddress}`}>{truncateHash(tx.fromAddress)}</Link>
                </td>
                <td className="px-6 py-4 font-mono text-blue-600 hover:underline dark:text-blue-400">
                  {tx.toAddress ? <Link href={`/address/${tx.toAddress}`}>{truncateHash(tx.toAddress)}</Link> : "Contract Creation"}
                </td>
                <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{tx.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kontrol Pagination */}
      <div className="mt-6 flex justify-between items-center text-gray-600 dark:text-gray-300">
        <Link href={`/transactions?page=${Math.max(1, currentPage - 1)}`} className={`inline-flex items-center px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100 ${currentPage <= 1 ? "pointer-events-none opacity-50" : ""}`}>
          &larr; Sebelumnya
        </Link>
        <span>
          Halaman {currentPage} dari {totalPages}
        </span>
        <Link href={`/transactions?page=${Math.min(totalPages, currentPage + 1)}`} className={`inline-flex items-center px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100 ${currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}`}>
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
      query: GET_TRANSACTIONS_PAGINATED,
      variables: { page, limit },
      fetchPolicy: "network-only",
    });

    return {
      props: {
        initialData: data.transactionsPaginated,
      },
    };
  } catch (error) {
    console.error("Gagal mengambil data transaksi:", error.message);
    // Kembalikan data kosong jika ada error agar halaman tidak rusak
    return {
      props: {
        initialData: { transactions: [], totalCount: 0 },
      },
    };
  }
}
