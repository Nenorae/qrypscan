// src/features/blocks/block.resolver.js
import * as blockModel from "./block.model.js";
// Kita butuh model transaksi untuk mengambil transaksi dalam sebuah blok
import { getTransactionsByBlockNumber } from "../transactions/transaction.model.js";

export const resolvers = {
  Query: {
    async blockByNumber(_, { number }) {
      const block = await blockModel.getBlockByNumber(number);
      if (!block) throw new Error(`Blok #${number} tidak ditemukan`);
      return block;
    },
    latestBlocks: (_, { limit = 10 }) => {
      return blockModel.getLatestBlocks(limit);
    },
    async blocksPaginated(_, { page = 1, limit = 10 }) {
      const [blocks, totalCount] = await Promise.all([blockModel.getBlocksPaginated(page, limit), blockModel.getTotalBlockCount()]);
      return { blocks, totalCount };
    },
  },
  Block: {
    // Mapping nama kolom DB ke nama field di skema GraphQL
    number: (parent) => parent.block_number,
    hash: (parent) => parent.block_hash,
    parentHash: (parent) => parent.parent_hash, // Perhatikan perubahan ke camelCase
    miner: (parent) => parent.miner, // [PERBAIKAN] Menambahkan field miner
    timestamp: (parent) => parent.block_timestamp,
    gasUsed: (parent) => parent.gas_used,
    gasLimit: (parent) => parent.gas_limit,
    transactionCount: (parent) => parent.transaction_count,
    baseFeePerGas: (parent) => parent.base_fee_per_gas,
    // Resolver untuk field nested
    transactions: (parent) => {
      // Memanggil fungsi dari model lain
      return getTransactionsByBlockNumber(parent.block_number);
    },
  },
};
