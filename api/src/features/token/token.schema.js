// api/src/features/token/token.schema.js
import { gql } from 'graphql-tag';

export default gql`
type TokenAsset {
  address: String!
  name: String
  symbol: String
  decimals: Int
  tokenType: String
  logoUrl: String # URL ke aset gambar
}

extend type Query {
  tokenAsset(address: String!): TokenAsset
}
`;
