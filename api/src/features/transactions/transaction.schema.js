import { gql } from 'graphql-tag';

export default gql`

# Tipe data untuk sebuah Transaksi
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
}
`;