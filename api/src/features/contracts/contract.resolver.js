// api/src/features/contracts/contract.resolver.js
import * as contractService from "./contract.service.js";
import logger from "../../core/logger.js";

const resolvers = {
  Query: {
    /**
     * Resolver untuk query `contract`.
     * Mengambil detail kontrak dari service.
     */
    contract: async (_, { address }) => {
      logger.info("[contract.resolver.js] >> Query.contract");
      return contractService.getContractByAddress(address);
    },
    /**
     * Resolver untuk query `contracts`.
     * Mengambil daftar semua kontrak.
     */
    contracts: async () => {
      logger.info("[contract.resolver.js] >> Query.contracts");
      return contractService.getContracts();
    },
    /**
     * Resolver untuk query `proxyUpgradeHistory`.
     * Mengambil riwayat upgrade sebuah proxy.
     */
    proxyUpgradeHistory: async (_, { address }) => {
      logger.info("[contract.resolver.js] >> Query.proxyUpgradeHistory");
      return contractService.getProxyUpgradeHistory(address);
    },
  },
  Mutation: {
    /**
     * Resolver untuk mutasi `verifyContract`.
     * Meneruskan input ke service untuk diproses.
     */
    verifyContract: async (_, { input }) => {
      logger.info("[contract.resolver.js] >> Mutation.verifyContract");
      return contractService.verify(input);
    },

    /**
     * Resolver untuk mutasi `verifyProxy`.
     * Meneruskan input ke service untuk verifikasi proxy.
     */
    verifyProxy: async (_, { input }) => {
      logger.info("[contract.resolver.js] >> Mutation.verifyProxy");
      return contractService.verifyProxy(input);
    },
  },
};

export default resolvers;