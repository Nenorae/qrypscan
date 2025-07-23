// src/features/addresses/address.resolver.js
import * as addressService from "./address.service.js";

export const resolvers = {
  Query: {
    addressDetails: async (_, { address }) => {
      try {
        return await addressService.getDetailsForAddress(address);
      } catch (e) {
        console.error(`❌ Error di addressDetails resolver: ${e.message}`);
        // Berikan error yang lebih ramah ke client
        throw new Error(`Gagal mendapatkan detail alamat: ${e.message}`);
      }
    },
  },
};
