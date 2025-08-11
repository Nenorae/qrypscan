// File: indexer/src/processors/tokenMetadata.js

import { ethers } from "ethers";
import { erc20Abi } from "../utils/erc20Abi.js";
import { saveTokenInfo } from "../db/queries/index.js";
import { tokenMetadataCache, CACHE_TTL } from "./tokenCache.js";
import { processingStats } from "./tokenStats.js";
import { tokenInterfaces } from "./tokenConstants.js";

/**
 * Get token metadata from cache or fetch from blockchain
 */
export async function getOrFetchTokenMetadata(contractAddress, provider, client, tokenStandard) {
  try {
    // Check cache first
    const cacheKey = `${contractAddress}-${tokenStandard}`;
    const cached = tokenMetadataCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      processingStats.cacheHits++;
      console.log(`[TOKEN-CACHE] Cache hit untuk ${contractAddress} (${tokenStandard})`);
      return cached.data;
    }
    console.log(`[TOKEN-CACHE] Cache miss untuk ${contractAddress} (${tokenStandard})`);

    // Check database
    console.log(`[TOKEN-DB] Memeriksa database untuk token ${contractAddress}`);
    const dbResult = await client.query("SELECT * FROM tokens WHERE contract_address = $1", [contractAddress]);

    if (dbResult.rowCount > 0) {
      const tokenInfo = dbResult.rows[0];
      console.log(`[TOKEN-DB] Ditemukan token yang ada di database: ${tokenInfo.symbol}`);

      // Cache the result
      tokenMetadataCache.set(cacheKey, {
        data: tokenInfo,
        timestamp: Date.now(),
      });
      console.log(`[TOKEN-CACHE] Menyimpan data token ${tokenInfo.symbol} ke cache`);

      return tokenInfo;
    }

    // Fetch from blockchain
    console.log(`[TOKEN-FETCH] Mengambil metadata untuk token ${tokenStandard} baru: ${contractAddress}`);

    const tokenInfo = await fetchTokenMetadata(contractAddress, provider, tokenStandard);

    if (tokenInfo) {
      // Save to database
      console.log(`[TOKEN-DB] Menyimpan info token baru ke database: ${tokenInfo.symbol}`);
      await saveTokenInfo(client, contractAddress, tokenInfo);
      processingStats.newTokensDiscovered++;

      // Cache the result
      tokenMetadataCache.set(cacheKey, {
        data: tokenInfo,
        timestamp: Date.now(),
      });
      console.log(`[TOKEN-CACHE] Menyimpan data token baru ${tokenInfo.symbol} ke cache`);

      console.log(`✅ [TOKEN-NEW] Token baru ditemukan: ${tokenInfo.symbol} (${tokenInfo.name})`);
    }

    return tokenInfo;
  } catch (error) {
    console.error(`💥 [TOKEN-METADATA] Error mendapatkan metadata token untuk ${contractAddress}:`, error.message);
    return null;
  }
}

/**
 * Fetch token metadata from blockchain with retry logic
 */
export async function fetchTokenMetadata(contractAddress, provider, tokenStandard, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[TOKEN-FETCH] Percobaan ${attempt}/${maxRetries} untuk ${contractAddress}`);

      let tokenInfo = {
        contract_address: contractAddress,
        token_type: tokenStandard,
        created_at: new Date(),
      };

      if (tokenStandard === "ERC20" || tokenStandard === "ERC721") {
        const contract = new ethers.Contract(contractAddress, tokenStandard === "ERC20" ? erc20Abi : tokenInterfaces.erc721, provider);

        // Use Promise.allSettled to handle partial failures
        console.log(`[TOKEN-FETCH] Memanggil name(), symbol(), decimals(), totalSupply() untuk ${contractAddress}`);
        const results = await Promise.allSettled([contract.name(), contract.symbol(), tokenStandard === "ERC20" ? contract.decimals() : Promise.resolve(0), contract.totalSupply().catch(() => BigInt(0))]);

        tokenInfo.name = results[0].status === "fulfilled" ? results[0].value : `Unknown Token`;
        tokenInfo.symbol = results[1].status === "fulfilled" ? results[1].value : `UNK`;
        tokenInfo.decimals = results[2].status === "fulfilled" ? Number(results[2].value) : tokenStandard === "ERC20" ? 18 : 0;
        tokenInfo.total_supply = results[3].status === "fulfilled" ? results[3].value.toString() : "0";

        console.log(`[TOKEN-FETCH] Metadata yang diambil: ${tokenInfo.symbol} (${tokenInfo.name})`);
        console.log(`    - Tipe: ${tokenStandard}, Desimal: ${tokenInfo.decimals}, Pasokan: ${tokenInfo.total_supply}`);
      } else if (tokenStandard === "ERC1155") {
        // ERC1155 tokens don't have standard metadata methods
        console.log(`[TOKEN-FETCH] Menggunakan metadata default untuk token ERC1155 ${contractAddress}`);
        tokenInfo.name = "ERC1155 Token";
        tokenInfo.symbol = "ERC1155";
        tokenInfo.decimals = 0;
        tokenInfo.total_supply = "0";
      }

      return tokenInfo;
    } catch (error) {
      console.warn(`⚠️  [TOKEN-FETCH] Percobaan ${attempt} gagal untuk ${contractAddress}: ${error.message}`);

      if (attempt === maxRetries) {
        console.error(`💥 [TOKEN-FETCH] Semua percobaan gagal untuk ${contractAddress}`);
        // Return minimal info so we can still process transfers
        return {
          contract_address: contractAddress,
          name: "Unknown Token",
          symbol: "UNK",
          decimals: tokenStandard === "ERC20" ? 18 : 0,
          total_supply: "0",
          token_type: tokenStandard,
          created_at: new Date(),
          metadata_failed: true,
        };
      }

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[TOKEN-FETCH] Menunggu ${delay}ms sebelum mencoba lagi...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
