import { gql } from "graphql-tag";

export default gql`
  scalar JSON # Definisi tipe JSON kustom

  type SourceFile {
    filePath: String!
    sourceCode: String!
  }

  type Contract {
    address: String!
    creatorAddress: String
    creationTxHash: String
    isVerified: Boolean
    sourceFiles: [SourceFile!] # Menggantikan sourceCode tunggal
    contractName: String
    compilerVersion: String
    abi: JSON
    optimizationUsed: Boolean
    runs: Int
    constructorArguments: String
    evmVersion: String
    isProxy: Boolean
    implementationAddress: String
    adminAddress: String
    blockNumber: Int
  }

  type VerificationResult {
    success: Boolean!
    message: String!
    contract: Contract
  }

  input VerifyContractInput {
    address: String!
    contractName: String!
    compilerVersion: String!
    sourceCode: String! # Tetap sebagai string, bisa berupa JSON atau kode tunggal
    isOptimized: Boolean
    optimizationRuns: Int
    constructorArguments: String # ABI-encoded arguments as a string
  }

  input VerifyProxyInput {
    proxyAddress: String!
    implementationAddress: String!
  }

  type ProxyUpgrade {
    implementationAddress: String!
    proxyType: String
    txHash: String!
    blockNumber: Int!
    blockTimestamp: String!
  }

  extend type Query {
    contract(address: String!): Contract
    contracts: [Contract]
    proxyUpgradeHistory(address: String!): [ProxyUpgrade]
  }

  type Mutation {
    verifyContract(input: VerifyContractInput!): VerificationResult
    verifyProxy(input: VerifyProxyInput!): VerificationResult
  }
`;
