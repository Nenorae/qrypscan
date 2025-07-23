// src/features/transactions/transaction.resolver.js
import * as transactionModel from "./transaction.model.js";

export const resolvers = {
  Query: {
    async transactionByHash(_, { hash }) {
      if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
        throw new Error("Format hash transaksi tidak valid");
      }
      const tx = await transactionModel.getTransactionByHash(hash);
      if (!tx) throw new Error(`Transaksi ${hash} tidak ditemukan`);
      return tx;
    },
    latestTransactions: (_, { limit = 6 }) => {
      return transactionModel.getLatestTransactions(limit);
    },
    async transactionsPaginated(_, { page = 1, limit = 20 }) {
      const [transactions, totalCount] = await Promise.all([
        transactionModel.getPaginatedTransactions({ page, limit }),
        transactionModel.getTotalTransactionCount(),
      ]);
      return { transactions, totalCount };
    },
  },
  Transaction: {
    // Mapping nama kolom DB ke nama field di skema GraphQL
    hash: (parent) => parent.tx_hash,
    blockNumber: (parent) => parent.block_number,
    blockTimestamp: (parent) => parent.block_timestamp,
    fromAddress: (parent) => parent.from_address,
    toAddress: (parent) => parent.to_address,
    value: (parent) => parent.value_wei,
    gas: (parent) => parent.gas_limit,
    gasPrice: (parent) => parent.gas_price,
    transactionIndex: (parent) => parent.transaction_index,
    inputData: (parent) => parent.input_data,
  },
};
