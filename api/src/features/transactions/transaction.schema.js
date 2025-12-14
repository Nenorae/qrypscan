import { gql } from 'graphql-tag';

export default gql`

# Tipe data untuk sebuah Transaksi (umum)
type Transaction {
  hash: String
  blockNumber: Int
  blockTimestamp: String
  fromAddress: String
  toAddress: String
  value: String
  gas: String
  gasPrice: String
  transactionIndex: Int
  inputData: String
}

# Tipe data untuk sebuah transfer Token (ERC20, ERC721, etc.)
type TokenTransfer {
  txHash: String!
  logIndex: Int!
  blockNumber: Int!
  blockTimestamp: String!
  contractAddress: String!
  fromAddress: String!
  toAddress: String!
  value: String
  tokenId: String
}

# Tipe untuk hasil paginasi transaksi
type TransactionPage {
  transactions: [Transaction]
  totalCount: Int
}

# Menambahkan query baru ke Query utama yang sudah ada
extend type Query {
  # Meminta satu transaksi berdasarkan hash-nya
  transactionByHash(hash: String!): Transaction

  # Meminta transaksi terbaru dengan limit
  latestTransactions(limit: Int): [Transaction]

  # Meminta transaksi dengan paginasi
  transactionsPaginated(page: Int, limit: Int): TransactionPage

  # Meminta daftar transfer token untuk alamat kontrak tertentu
  transactionsByContractAddress(address: String!, limit: Int, offset: Int): [TokenTransfer]
}
`;