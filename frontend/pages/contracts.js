// frontend/pages/contracts.js
import { gql } from '@apollo/client';
import client from '../lib/api';
import Link from 'next/link';
import Head from 'next/head';

const GET_CONTRACTS = gql`
  query GetContracts {
    contracts {
      address
      contractName
      creationTxHash
      isVerified
      isProxy # 1. Ambil field isProxy
    }
  }
`;

export default function ContractsPage({ contracts }) {
  return (
    <div className="font-sans p-4 md:p-8 max-w-7xl mx-auto bg-gray-50 text-gray-900 min-h-screen dark:bg-gray-900 dark:text-gray-100">
      <Head>
        <title>Contracts - QrypScan</title>
      </Head>

      <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">All Contracts</h1>

      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                Address
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                Contract Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                Creation Transaction
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            {contracts.map((contract) => (
              <tr key={contract.address}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600 dark:text-blue-400">
                  <Link href={`/contract/${contract.address}`}>{contract.address}</Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {contract.contractName || '-'}
                  {/* 2. Tampilkan lencana jika isProxy true */}
                  {contract.isProxy && (
                    <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                      PROXY
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600 dark:text-blue-400">
                  <Link href={`/tx/${contract.creationTxHash}`}>{contract.creationTxHash.substring(0, 12)}...</Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {contract.isVerified ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                      Verified
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                      Unverified
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  const { data } = await client.query({
    query: GET_CONTRACTS,
    fetchPolicy: 'network-only',
  });

  return {
    props: {
      contracts: data.contracts,
    },
  };
}
