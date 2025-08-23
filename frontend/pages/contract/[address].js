// frontend/pages/contract/[address].js

import { gql } from '@apollo/client';
import client from '../../lib/api';
import Head from 'next/head';
import Link from 'next/link';
import { VerifiedInfo, UnverifiedInfo } from '../../components/ContractDetails';

const GET_CONTRACT = gql`
  query GetContract($address: String!) {
    contract(address: $address) {
      address
      creatorAddress
      creationTxHash
      isVerified
      sourceFiles {
        filePath
        sourceCode
      }
      contractName
      compilerVersion
      abi
      optimizationUsed
      runs
      constructorArguments
      evmVersion
      isProxy
      implementationAddress
      adminAddress
      blockNumber
    }
  }
`;


export default function ContractPage({ contract, address }) {
    // Jika kontrak tidak ditemukan di database sama sekali
    if (!contract) {
        return (
             <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
                <Head>
                    <title>Kontrak Tidak Ditemukan - QrypScan</title>
                </Head>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Kontrak Tidak Ditemukan</h1>
                <p className="text-gray-600 mt-2 dark:text-gray-400">Alamat kontrak {address} tidak ditemukan di database QrypScan.</p>
                <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block dark:text-blue-400">
                    &larr; Kembali ke Halaman Utama
                </Link>
            </div>
        )
    }

    const isVerified = contract.isVerified;

    return (
        <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
            <Head>
                <title>Kontrak {address} - QrypScan</title>
            </Head>

            <header className="mb-6">
                 <h1 className="text-2xl font-bold break-all text-gray-800 dark:text-gray-100">Detail Kontrak</h1>
                <p className="font-mono text-gray-600 dark:text-gray-400">{address}</p>
            </header>

            <main>
                {isVerified ? <VerifiedInfo contract={contract} /> : <UnverifiedInfo contract={contract} />}
            </main>
        </div>
    );

}

export async function getServerSideProps(context) {
    const { address } = context.params;

    console.log(`[Frontend SSR] Fetching contract data for address: ${address}`);

    if (!address || typeof address !== "string" || !address.startsWith('0x')) {
        console.log("[Frontend SSR] Invalid address, returning notFound.");
        return { notFound: true };
    }

    try {
        const { data, error, loading } = await client.query({
            query: GET_CONTRACT,
            variables: { address },
            fetchPolicy: 'network-only',
        });

        if (loading) {
            console.log("[Frontend SSR] Apollo query is loading...");
        }
        if (error) {
            console.error("[Frontend SSR] Apollo query error:", error);
        }
        
        console.log("[Frontend SSR] Data received from API:", data);

        return { props: { contract: data ? data.contract : null, address } };
    } catch (error) {
        console.error(`[Frontend SSR] Critical error fetching contract ${address}:`, error);
        // Ini bisa terjadi jika kontrak belum ada di DB atau API down.
        // Kita akan kembalikan null dan biarkan halaman menampilkan form verifikasi.
        return { props: { contract: null, address } };
    }
}