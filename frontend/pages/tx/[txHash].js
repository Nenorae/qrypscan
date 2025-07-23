// File: frontend/pages/tx/[txHash].js

import Head from "next/head";
import client from "../../lib/api";
import { gql } from "@apollo/client";
import Link from 'next/link';
import { ethers } from 'ethers';

const GET_TRANSACTION_DETAILS = gql`
  query GetTransactionAndContract($hash: String!, $address: String!) {
    transactionByHash(hash: $hash) {
      hash
      blockNumber
      blockTimestamp
      fromAddress
      toAddress
      value
      gas
      gasPrice
      transactionIndex
      inputData
    }
    contract(address: $address) {
      abi
    }
  }
`;

function DecodedInputData({ inputData, contractAbi }) {
    if (!contractAbi || inputData === '0x') {
        return <textarea readOnly value={inputData} className="w-full h-32 font-mono bg-gray-100 text-gray-900 p-3 rounded-md border border-gray-300 focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600" />;
    }

    try {
        const iface = new ethers.Interface(contractAbi);
        const decoded = iface.parseTransaction({ data: inputData });

        if (!decoded) {
            return <textarea readOnly value={inputData} className="w-full h-32 font-mono bg-gray-100 text-gray-900 p-3 rounded-md border border-gray-300 focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600" />;
        }

        return (
            <div className="p-3 bg-gray-100 rounded-md border border-gray-300 dark:bg-gray-700 dark:border-gray-600">
                <p><strong>Function:</strong> {decoded.name}</p>
                <p><strong>Arguments:</strong></p>
                <ul>
                    {decoded.args.map((arg, i) => (
                        <li key={i} className="ml-4">- {arg.toString()}</li>
                    ))}
                </ul>
            </div>
        );
    } catch (error) {
        return <textarea readOnly value={inputData} className="w-full h-32 font-mono bg-gray-100 text-gray-900 p-3 rounded-md border border-gray-300 focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600" />;
    }
}

export default function TransactionDetailsPage({ tx, contract }) {
  if (!tx) {
    return (
      <div className="bg-gray-50 text-gray-900 min-h-screen p-8 text-center dark:bg-gray-900 dark:text-gray-100">
        <Head>
          <title>Transaksi Tidak Ditemukan</title>
        </Head>
        <h1 className="text-3xl font-bold mb-4 text-gray-800 dark:text-gray-100">❌ Transaksi Tidak Ditemukan</h1>
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
          Kembali ke Halaman Utama
        </Link>
      </div>
    );
  }

  return (
    <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
      <Head>
        <title>Transaksi {tx.hash.substring(0, 12)}... - QrypScan</title>
      </Head>

      <header className="mb-8 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-3xl font-bold mb-2 break-all text-gray-800 dark:text-gray-100">Detail Transaksi</h1>
        <p className="font-mono text-gray-600 text-lg dark:text-gray-400">{tx.hash}</p>
        <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block dark:text-blue-400">
          &larr; Kembali ke Halaman Utama
        </Link>
      </header>

      <main>
        <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-lg dark:bg-gray-800 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-y-6">
            <strong className="text-gray-800 dark:text-gray-300">Blok:</strong>
            <Link href={`/block/${tx.blockNumber}`} className="text-blue-600 hover:underline font-mono dark:text-blue-400">
              {tx.blockNumber}
            </Link>
            <strong className="text-gray-800 dark:text-gray-300">Timestamp:</strong>
            <span className="text-gray-700 dark:text-gray-300">{new Date(parseInt(tx.blockTimestamp) * 1000).toLocaleString("id-ID")}</span>
            <strong className="text-gray-800 dark:text-gray-300">Dari:</strong>
            <span className="font-mono text-gray-700 dark:text-gray-300">{tx.fromAddress}</span>
            <strong className="text-gray-800 dark:text-gray-300">Ke:</strong>
            <span className="font-mono text-gray-700 dark:text-gray-300">{tx.toAddress || "(Contract Creation)"}</span>
            <strong className="text-gray-800 dark:text-gray-300">Value (wei):</strong>
            <span className="text-gray-700 dark:text-gray-300">{tx.value}</span>
            <strong className="text-gray-800 dark:text-gray-300">Gas Limit:</strong>
            <span className="text-gray-700 dark:text-gray-300">{tx.gas}</span>
            <strong className="text-gray-800 dark:text-gray-300">Gas Price (wei):</strong>
            <span className="text-gray-700 dark:text-gray-300">{tx.gasPrice}</span>
            <strong className="text-gray-800 dark:text-gray-300">Input Data:</strong>
            <DecodedInputData inputData={tx.inputData} contractAbi={contract ? contract.abi : null} />
          </div>
        </div>
      </main>
    </div>
  );
}


export async function getServerSideProps(context) {
  const { txHash } = context.params;

  if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
    return { props: { tx: null, contract: null } };
  }

  try {
    // First, get the transaction details to find the `to` address
    const txResult = await client.query({
      query: gql`query GetToAddress($hash: String!) { transactionByHash(hash: $hash) { toAddress } }`,
      variables: { hash: txHash },
    });

    const toAddress = txResult.data.transactionByHash?.toAddress;

    // Now, fetch both transaction and contract ABI in one go
    const { data } = await client.query({
      query: GET_TRANSACTION_DETAILS,
      variables: { 
        hash: txHash,
        address: toAddress || '0x0000000000000000000000000000000000000000' // Dummy address if no toAddress
      },
    });

    return { props: { tx: data.transactionByHash, contract: data.contract } };
  } catch (error) {
    console.error("Gagal mengambil data detail transaksi:", error);
    return { props: { tx: null, contract: null } };
  }
}