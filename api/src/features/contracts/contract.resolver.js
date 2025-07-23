// api/src/features/contracts/contract.resolver.js
import * as contractService from "./contract.service.js";

const resolvers = {
  Query: {
    /**
     * Resolver untuk query `contract`.
     * Mengambil detail kontrak dari service.
     */
    contract: async (_, { address }) => {
      return contractService.getContractByAddress(address);
    },
    /**
     * Resolver untuk query `contracts`.
     * Mengambil daftar semua kontrak.
     */
    contracts: async () => {
      return contractService.getContracts();
    },
  },
  Mutation: {
    /**
     * Resolver untuk mutasi `verifyContract`.
     * Meneruskan input ke service untuk diproses.
     */
    verifyContract: async (_, { input }) => {
      return contractService.verify(input);
    },

    /**
     * Resolver untuk mutasi `verifyProxy`.
     * Meneruskan input ke service untuk verifikasi proxy.
     */
    verifyProxy: async (_, { input }) => {
      return contractService.verifyProxy(input);
    },
  },
};

export default resolvers;
