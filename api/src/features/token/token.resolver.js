// api/src/features/token/token.resolver.js
import * as tokenService from "./token.service.js";
import logger from "../../core/logger.js";

export const resolvers = {
  Query: {
    tokenAsset: async (_, { address }) => {
      logger.info(`[token.resolver.js] >> Query.tokenAsset for address: ${address}`);
      try {
        const asset = await tokenService.getTokenAssetInfo(address);
        if (!asset) {
          logger.warn(`[token.resolver.js] Token asset tidak ditemukan untuk alamat: ${address}`);
          // Mengembalikan null untuk GraphQL jika tidak ditemukan
          return null;
        }
        return asset;
      } catch (error) {
        logger.error(`[token.resolver.js] Error fetching token asset for ${address}:`, error);
        throw new Error(`Gagal mengambil aset token: ${error.message}`);
      }
    },
  },
};
