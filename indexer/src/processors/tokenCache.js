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
  console.log(`🧹 [TOKEN-CACHE] Membersihkan ${cacheSize} entri cache metadata token`);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  console.log("[TOKEN-CACHE] Mengambil statistik cache...");
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

  const stats = {
    totalEntries: tokenMetadataCache.size,
    validEntries: valid,
    expiredEntries: expired,
    cacheTtl: CACHE_TTL,
  };
  console.log("[TOKEN-CACHE] Statistik cache saat ini:", stats);
  return stats;
}

export { tokenMetadataCache, CACHE_TTL };
