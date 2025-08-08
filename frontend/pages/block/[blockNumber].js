import Head from "next/head";
import client from "../../lib/api";
import { gql } from "@apollo/client";
import Link from "next/link";
import { useState, useEffect } from "react"; // ✅ DI-IMPORT: useState dan useEffect

// 1. Definisikan query GraphQL dengan variabel
const GET_BLOCK_DETAILS = gql`
  query GetBlockByNumber($number: Int!) {
    blockByNumber(number: $number) {
      number
      hash
      parentHash
      timestamp
      miner
      gasUsed
      gasLimit
      transactionCount
      baseFeePerGas
      transactions {
        hash
        fromAddress
        toAddress
        value
        transactionIndex
      }
    }
  }
`;

// 2. Komponen Halaman React
export default function BlockDetailsPage({ block }) {
  // ✅ BARU: State untuk menampung waktu yang akan ditampilkan dengan aman
  const [displayTime, setDisplayTime] = useState("Memuat...");

  // ✅ BARU: useEffect untuk memformat waktu di sisi client
  useEffect(() => {
    if (block && block.timestamp) {
      // Ingat: * 1000 dihilangkan karena timestamp sudah dalam milidetik
      const clientTime = new Date(parseInt(block.timestamp)).toLocaleString("id-ID");
      setDisplayTime(clientTime);
    }
  }, [block]); // Efek ini berjalan setiap kali data 'block' berubah

  // Fungsi untuk memotong hash
  const truncateHash = (hash) => (hash ? `${hash.substring(0, 10)}...${hash.substring(hash.length - 10)}` : "N/A");

  // Tampilan jika blok tidak ditemukan
  if (!block) {
    return (
      <div className="bg-gray-50 text-gray-900 min-h-screen p-8 text-center dark:bg-gray-900 dark:text-gray-100">
        <Head>
          <title>Blok Tidak Ditemukan</title>
        </Head>
        <h1 className="text-3xl font-bold mb-4 text-gray-800 dark:text-gray-100">❌ Blok Tidak Ditemukan</h1>
        <p className="text-gray-600 dark:text-gray-300">Blok yang Anda cari tidak ada di dalam database.</p>
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
          Kembali ke Halaman Utama
        </Link>
      </div>
    );
  }

  return (
    <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
      <Head>
        {/* ✅ DIUBAH: Menggunakan template literal agar judul menjadi satu string utuh */}
        <title>{`Blok #${block.number} - QrypScan`}</title>
      </Head>

      <header className="mb-8 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Blok #{block.number}</h1>
        <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block dark:text-blue-400">
          &larr; Kembali ke Halaman Utama
        </Link>
      </header>

      <main>
        {/* Detail Utama Blok */}
        <div className="mb-8 border border-gray-300 rounded-lg p-6 bg-white shadow-lg dark:bg-gray-800 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Detail Blok</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-y-6 text-gray-700 dark:text-gray-300">
            <strong>Hash:</strong>
            <span className="font-mono break-all">{block.hash}</span>
            <strong>Parent Hash:</strong>
            <span className="font-mono break-all">{block.parentHash}</span>
            <strong>Timestamp:</strong>
            {/* ✅ DIUBAH: Menampilkan state 'displayTime' yang aman */}
            <span>{displayTime}</span>
            <strong>Validator:</strong>
            <span className="font-mono break-all">{block.miner}</span>
            <strong>Gas Used:</strong>
            <span>{block.gasUsed}</span>
            <strong>Gas Limit:</strong>
            <span>{block.gasLimit}</span>
            <strong>Base Fee/Gas:</strong>
            <span>{block.baseFeePerGas || "N/A"}</span>
            <strong>Jumlah Transaksi:</strong>
            <span>{block.transactionCount}</span>
          </div>
        </div>

        {/* Daftar Transaksi */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Transaksi di dalam Blok Ini ({block.transactionCount})</h2>
          {block.transactions && block.transactions.length > 0 ? (
            <div className="overflow-x-auto shadow-md rounded-lg bg-white dark:bg-gray-800">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-300">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-200">
                  <tr>
                    <th scope="col" className="px-6 py-3">
                      #
                    </th>
                    <th scope="col" className="px-6 py-3">
                      Hash Transaksi
                    </th>
                    <th scope="col" className="px-6 py-3">
                      Dari
                    </th>
                    <th scope="col" className="px-6 py-3">
                      Ke
                    </th>
                    <th scope="col" className="px-6 py-3">
                      Value (wei)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {block.transactions.map((tx) => (
                    <tr key={tx.hash} className="bg-white border-b border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{tx.transactionIndex}</td>
                      <td className="px-6 py-4 font-mono text-blue-600 hover:underline dark:text-blue-400">
                        <Link href={`/tx/${tx.hash}`}>{truncateHash(tx.hash)}</Link>
                      </td>
                      <td className="px-6 py-4 font-mono text-blue-600 hover:underline dark:text-blue-400">{truncateHash(tx.fromAddress)}</td>
                      <td className="px-6 py-4 font-mono text-blue-600 hover:underline dark:text-blue-400">{truncateHash(tx.toAddress)}</td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{tx.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-700 dark:text-gray-300">Tidak ada transaksi di dalam blok ini.</p>
          )}
        </div>
      </main>
    </div>
  );
}

// 3. Fungsi Server-Side Data Fetching
export async function getServerSideProps(context) {
  try {
    const { blockNumber } = context.params;
    const { data } = await client.query({
      query: GET_BLOCK_DETAILS,
      variables: {
        number: parseInt(blockNumber, 10),
      },
    });

    return {
      props: {
        block: data.blockByNumber,
      },
    };
  } catch (error) {
    console.error("Error fetching block details:", JSON.stringify(error, null, 2));

    return {
      props: {
        block: null,
      },
    };
  }
}

