import { gql, useQuery } from "@apollo/client";
import Link from "next/link";

// Query GraphQL untuk mendapatkan blok terbaru
const GET_LATEST_BLOCKS = gql`
  query GetLatestBlocks {
    latestBlocks(limit: 6) {
      number
      hash
      timestamp
      transactionCount
    }
  }
`;

// Fungsi kecil untuk format waktu relatif
function timeAgo(timestamp) {
  const now = new Date();
  const past = new Date(parseInt(timestamp) * 1000);
  const seconds = Math.floor((now - past) / 1000);

  if (seconds < 2) {
    return "baru saja";
  }
  if (seconds < 60) {
    return `${seconds} detik yang lalu`;
  }
  // Anda bisa menambahkan logika untuk menit, jam, dst.
  return new Date(past).toLocaleString("id-ID");
}

export default function LatestBlocks() {
  // Menggunakan pollInterval agar data diperbarui secara otomatis setiap 4 detik
  const { loading, error, data } = useQuery(GET_LATEST_BLOCKS, {
    pollInterval: 4000,
  });

  if (loading) return <div className="text-center text-gray-500 py-4 dark:text-gray-400">Memuat blok...</div>;
  if (error) return <p className="text-red-500 dark:text-red-400">Error: {error.message}</p>;

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg dark:bg-gray-900">
      {data &&
        data.latestBlocks.map((block) => (
          <div
            key={block.number}
            className="flex items-center border border-gray-200 p-4 mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          >
            {/* Ikon Blok */}
            <div
              className="mr-4 bg-gray-100 p-4 rounded-md dark:bg-gray-700"
            >
              <span className="text-2xl">📦</span>
            </div>

            {/* Detail Blok */}
            <div className="flex-grow">
              <Link
                href={`/block/${block.number}`}
                className="text-blue-600 hover:underline text-lg font-semibold dark:text-blue-400"
              >
                Blok #{block.number}
              </Link>
              <div className="text-gray-600 text-sm dark:text-gray-400">{block.transactionCount} transaksi</div>
            </div>

            {/* Timestamp */}
            <div
              className="text-gray-600 text-sm text-right dark:text-gray-400"
            >
              {timeAgo(block.timestamp)}
            </div>
          </div>
        ))}
      <Link
        href="/blocks"
        className="text-blue-600 hover:underline block text-center mt-4 dark:text-blue-400"
      >
        Lihat Semua Blok &rarr;
      </Link>
    </div>
  );
}