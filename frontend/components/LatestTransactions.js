// File: frontend/components/LatestTransactions.js
import { gql, useQuery } from "@apollo/client";
import Link from "next/link";

const GET_LATEST_TRANSACTIONS = gql`
  query GetLatestTransactions {
    latestTransactions(limit: 6) {
      hash
      fromAddress 
      toAddress   
      blockNumber 
    }
  }
`;

export default function LatestTransactions() {
  const { loading, error, data } = useQuery(GET_LATEST_TRANSACTIONS, {
    pollInterval: 4000,
  });

  const truncateHash = (hash) => (hash ? `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}` : "N/A");

  if (loading) return <div className="text-center text-gray-500 py-4 dark:text-gray-400">Memuat transaksi...</div>;
  if (error) return <p className="text-red-500 py-4 text-center dark:text-red-400">Error: {error.message}</p>;
  if (!data || data.latestTransactions.length === 0) {
    return <div className="text-center text-gray-500 py-4 border border-gray-200 bg-white rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">Belum ada transaksi.</div>;
  }

  return (
    <div className="space-y-3 bg-white p-4 rounded-lg shadow-lg dark:bg-gray-900">
      {data.latestTransactions.map((tx) => (
        <div key={tx.hash} className="flex items-start p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
          {/* Ikon Transaksi */}
          <div className="mr-3 p-3 bg-gray-100 rounded-lg flex-shrink-0 dark:bg-gray-700">
            <span className="text-xl">📄</span>
          </div>

          {/* Detail Transaksi */}
          <div className="font-mono text-sm overflow-hidden">
            <div className="mb-1">
              <Link href={`/tx/${tx.hash}`} className="text-blue-600 hover:underline font-medium truncate block dark:text-blue-400">
                Tx# {truncateHash(tx.hash)}
              </Link>
            </div>

            <div className="text-gray-600 truncate dark:text-gray-400">
              <span className="text-gray-500 dark:text-gray-500">Dari:</span>{" "}
              <Link href={`/address/${tx.fromAddress}`} className="text-blue-600 hover:underline truncate dark:text-blue-400">
                {truncateHash(tx.fromAddress)}
              </Link>
            </div>

            <div className="text-gray-600 truncate dark:text-gray-400">
              <span className="text-gray-500 dark:text-gray-500">Ke:</span>{" "}
              {tx.toAddress ? (
                <Link href={`/address/${tx.toAddress}`} className="text-blue-600 hover:underline truncate dark:text-blue-400">
                  {truncateHash(tx.toAddress)}
                </Link>
              ) : (
                <span className="text-gray-500 italic dark:text-gray-500">[Contract Creation]</span>
              )}
            </div>
          </div>
        </div>
      ))}

      <Link href="/transactions" className="text-blue-600 hover:underline text-center mt-2 block font-semibold py-2 border-t border-gray-200 dark:border-gray-700 dark:text-blue-400">
        Lihat Semua Transaksi &rarr;
      </Link>
    </div>
  );
}