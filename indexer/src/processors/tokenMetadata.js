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
      console.log(`💾 [TOKEN-CACHE] Cache hit for ${contractAddress} (${tokenStandard})`);
      return cached.data;
    }

    // Check database
    const dbResult = await client.query("SELECT * FROM tokens WHERE contract_address = $1", [contractAddress]);

    if (dbResult.rowCount > 0) {
      const tokenInfo = dbResult.rows[0];
      console.log(`📁 [TOKEN-DB] Found existing token in database: ${tokenInfo.symbol}`);

      // Cache the result
      tokenMetadataCache.set(cacheKey, {
        data: tokenInfo,
        timestamp: Date.now(),
      });

      return tokenInfo;
    }

    // Fetch from blockchain
    console.log(`🌐 [TOKEN-FETCH] Fetching metadata for new ${tokenStandard} token: ${contractAddress}`);

    const tokenInfo = await fetchTokenMetadata(contractAddress, provider, tokenStandard);

    if (tokenInfo) {
      // Save to database
      await saveTokenInfo(client, contractAddress, tokenInfo);
      processingStats.newTokensDiscovered++;

      // Cache the result
      tokenMetadataCache.set(cacheKey, {
        data: tokenInfo,
        timestamp: Date.now(),
      });

      console.log(`✅ [TOKEN-NEW] New token discovered: ${tokenInfo.symbol} (${tokenInfo.name})`);
    }

    return tokenInfo;
  } catch (error) {
    console.error(`💥 [TOKEN-METADATA] Error getting token metadata for ${contractAddress}:`, error.message);
    return null;
  }
}

/**
 * Fetch token metadata from blockchain with retry logic
 */
export async function fetchTokenMetadata(contractAddress, provider, tokenStandard, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [TOKEN-FETCH] Attempt ${attempt}/${maxRetries} for ${contractAddress}`);

      let tokenInfo = {
        contract_address: contractAddress,
        token_type: tokenStandard,
        created_at: new Date(),
      };

      if (tokenStandard === "ERC20" || tokenStandard === "ERC721") {
        const contract = new ethers.Contract(contractAddress, tokenStandard === "ERC20" ? erc20Abi : tokenInterfaces.erc721, provider);

        // Use Promise.allSettled to handle partial failures
        const results = await Promise.allSettled([contract.name(), contract.symbol(), tokenStandard === "ERC20" ? contract.decimals() : Promise.resolve(0), contract.totalSupply().catch(() => BigInt(0))]);

        tokenInfo.name = results[0].status === "fulfilled" ? results[0].value : `Unknown Token`;
        tokenInfo.symbol = results[1].status === "fulfilled" ? results[1].value : `UNK`;
        tokenInfo.decimals = results[2].status === "fulfilled" ? Number(results[2].value) : tokenStandard === "ERC20" ? 18 : 0;
        tokenInfo.total_supply = results[3].status === "fulfilled" ? results[3].value.toString() : "0";

        console.log(`📋 [TOKEN-FETCH] Metadata fetched: ${tokenInfo.symbol} (${tokenInfo.name})`);
        console.log(`    📊 Type: ${tokenStandard}, Decimals: ${tokenInfo.decimals}, Supply: ${tokenInfo.total_supply}`);
      } else if (tokenStandard === "ERC1155") {
        // ERC1155 tokens don't have standard metadata methods
        tokenInfo.name = "ERC1155 Token";
        tokenInfo.symbol = "ERC1155";
        tokenInfo.decimals = 0;
        tokenInfo.total_supply = "0";
      }

      return tokenInfo;
    } catch (error) {
      console.warn(`⚠️  [TOKEN-FETCH] Attempt ${attempt} failed for ${contractAddress}: ${error.message}`);

      if (attempt === maxRetries) {
        console.error(`💥 [TOKEN-FETCH] All attempts failed for ${contractAddress}`);
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
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
