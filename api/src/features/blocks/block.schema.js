// src/features/blocks/block.schema.js
import { gql } from 'graphql-tag';

export default gql`
# Tipe data untuk sebuah Blok
type Block {
  number: Int
  hash: String
  parentHash: String # Menggunakan camelCase lebih umum di GraphQL
  timestamp: String
  miner: String
  gasUsed: String
  gasLimit: String
  transactionCount: Int
  baseFeePerGas: String
  transactions: [Transaction]
}

# Tipe untuk pagination blok
type BlocksPage {
  blocks: [Block]
  totalCount: Int
}

# Mendefinisikan Query utama untuk pertama kali
type Query {
  # Meminta satu blok berdasarkan nomornya
  blockByNumber(number: Int!): Block

  # Meminta blok terbaru dengan limit
  latestBlocks(limit: Int): [Block]

  # Meminta blok dengan pagination
  blocksPaginated(page: Int, limit: Int): BlocksPage
}

`;