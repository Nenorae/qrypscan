// File: frontend/pages/index.js (Styled)

import Head from "next/head";
import SearchBar from "../components/SearchBar";
import LatestBlocks from "../components/LatestBlocks";
import LatestTransactions from "../components/LatestTransactions";

export default function HomePage() {
  return (
    // Dark background for the entire page
    <div className="bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
      <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto">
        <Head>
          <title>QrypScan - Block Explorer</title>
        </Head>

        <header className="mb-8 pb-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 dark:text-gray-100">🚀 QrypScan</h1>
          <p className="text-lg text-gray-600 mt-2 dark:text-gray-300">Block Explorer untuk Jaringan Pribadi Anda</p>
        </header>

        <main>
          {/* SearchBar (will be styled in its own file) */}
          <SearchBar />

          {/* 2-column layout for Blocks and Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4 dark:text-gray-100">Blok Terbaru</h2>
              <LatestBlocks />
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4 dark:text-gray-100">Transaksi Terbaru</h2>
              <LatestTransactions />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
