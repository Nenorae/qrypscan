import { gql } from 'graphql-tag';

export default gql`
type AddressDetails {
  address: String
  balance: String # Saldo akan kita ambil live dari node
  transactions: [Transaction] # Riwayat transaksi dari database
  isContract: Boolean
}

# Menambahkan query baru ke Query utama
extend type Query {
  # Meminta detail alamat dan transaksi terkait
  addressDetails(address: String!): AddressDetails
}`;