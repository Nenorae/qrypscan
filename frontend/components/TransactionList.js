// frontend/components/TransactionList.js
import React from 'react';
import { gql, useQuery } from '@apollo/client';
import Link from 'next/link';

const GET_CONTRACT_TRANSACTIONS = gql`
  query GetContractTransactions($address: String!, $limit: Int, $offset: Int) {
    transactionsByContractAddress(address: $address, limit: $limit, offset: $offset) {
      txHash
      blockNumber
      blockTimestamp
      fromAddress
      toAddress
      value
      tokenId
    }
  }
`;

const TransactionList = ({ contractAddress }) => {
  const { loading, error, data } = useQuery(GET_CONTRACT_TRANSACTIONS, {
    variables: { address: contractAddress, limit: 25, offset: 0 },
    skip: !contractAddress, // Don't run query if address is not available
  });

  if (loading) return <p>Loading transactions...</p>;
  if (error) return <p>Error loading transactions: {error.message}</p>;

  const transactions = data?.transactionsByContractAddress || [];

  if (transactions.length === 0) {
    return <p>No token transactions found for this contract.</p>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tx Hash</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Block</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">From</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">To</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Value / Token ID</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {transactions.map((tx) => (
            <tr key={tx.txHash}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600 dark:text-blue-400">
                <Link href={`/tx/${tx.txHash}`} className="truncate hover:underline">
                  {tx.txHash.substring(0, 12)}...
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{tx.blockNumber}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600 dark:text-blue-400">
                <Link href={`/address/${tx.fromAddress}`} className="truncate hover:underline">
                  {tx.fromAddress.substring(0, 12)}...
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600 dark:text-blue-400">
                <Link href={`/address/${tx.toAddress}`} className="truncate hover:underline">
                  {tx.toAddress.substring(0, 12)}...
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {tx.tokenId ? `ID: ${tx.tokenId}` : tx.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionList;
