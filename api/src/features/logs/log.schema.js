import { gql } from 'graphql-tag';

const logSchema = gql`
  type Log {
    transactionHash: String
    blockNumber: Int
    logIndex: Int
    address: String
    topics: [String]
    data: String
  }
`;

export default logSchema;
