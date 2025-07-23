// File: frontend/pages/address/[address].js

import Head from "next/head";
import client from "../../lib/api";
import { gql } from "@apollo/client";
import { ethers } from "ethers";
import Link from 'next/link';

const GET_ADDRESS_DETAILS = gql`
  query GetAddressDetails($address: String!) {
    addressDetails(address: $address) {
      address
      balance
      isContract
      transactions {
        hash
        fromAddress
        toAddress
        value
        blockNumber
      }
    }
  }
`;

export default function AddressDetailsPage({ data }) {
  if (!data || !data.addressDetails) {
    return <div className="bg-gray-50 text-gray-900 min-h-screen p-8 dark:bg-gray-900 dark:text-gray-100">Alamat tidak ditemukan atau terjadi error.</div>;
  }

  const { address, balance, transactions, isContract } = data.addressDetails;
  const truncateHash = (hash) => (hash ? `${hash.substring(0, 10)}...${hash.substring(hash.length - 10)}` : "N/A");

  return (
    <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
      <Head>
        <title>Alamat {truncateHash(address)} - QrypScan</title>
      </Head>
      <h1 className="text-3xl font-bold mb-2 break-all text-gray-800 dark:text-gray-100">Detail Alamat</h1>
      <p className="font-mono text-gray-600 text-lg mb-6 dark:text-gray-300">{address}</p>

      {isContract && (
        <div className="my-4 p-4 bg-blue-100 border border-blue-300 rounded-lg text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-100">
          <p className="mb-2">Alamat ini adalah sebuah kontrak. Anda dapat memverifikasi dan melihat kode sumbernya di sini:</p>
          <Link href={`/contract/${address}`} className="text-blue-600 hover:underline font-bold dark:text-blue-300">
            Lihat & Verifikasi Kontrak
          </Link>
        </div>
      )}

      <h2 className="text-2xl font-semibold mt-6 mb-4 text-gray-800 dark:text-gray-100">Saldo: {ethers.formatEther(balance)} ETH</h2>

      <hr className="border-gray-200 my-6 dark:border-gray-700"/>

      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Riwayat Transaksi ({transactions.length})</h3>
      {transactions.length > 0 ? (
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
              {transactions.map((tx) => (
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
      ) : (
        <p className="text-gray-700 dark:text-gray-300">Tidak ada riwayat transaksi.</p>
      )}
    </div>
  );
}


export async function getServerSideProps(context) {
  const { address } = context.params;

  // PERBAIKAN 1: Validasi lebih ketat
  const isInvalidAddress = !address || typeof address !== "string" || address.toLowerCase() === "null" || address.toLowerCase() === "undefined" || !ethers.isAddress(address); // Gunakan validasi ethers.js

  if (isInvalidAddress) {
    return {
      props: {
        data: null,
        error: "Alamat Ethereum tidak valid",
      },
    };
  }

  try {
    const { data } = await client.query({
      query: GET_ADDRESS_DETAILS,
      variables: { address },
    });

    if (data && data.addressDetails && data.addressDetails.isContract) {
      return {
        redirect: {
          destination: `/contract/${address}`,
          permanent: false, // Ini adalah redirect sementara
        },
      };
    }

    return { props: { data } };
  } catch (error) {
    console.error("Error fetching address details:", error);
    return {
      props: {
        data: null,
        error: "Gagal memuat data alamat",
      },
    };
  }
}