// File: indexer/src/processors/tokenCache.js

// Caching untuk metadata token
const tokenMetadataCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

/**
 * Clear token metadata cache
 */
export function clearTokenCache() {
  const cacheSize = tokenMetadataCache.size;
  tokenMetadataCache.clear();
  console.log(`🧹 [TOKEN-CACHE] Cleared ${cacheSize} cached token metadata entries`);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const now = Date.now();
  let expired = 0;
  let valid = 0;

  for (const [key, entry] of tokenMetadataCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      expired++;
    } else {
      valid++;
    }
  }

  return {
    totalEntries: tokenMetadataCache.size,
    validEntries: valid,
    expiredEntries: expired,
    cacheTtl: CACHE_TTL,
  };
}

export { tokenMetadataCache, CACHE_TTL };
