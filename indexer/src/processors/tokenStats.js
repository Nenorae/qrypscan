// File: indexer/src/processors/tokenStats.js

import { tokenMetadataCache } from "./tokenCache.js";

// Performance tracking
let processingStats = {
  totalLogs: 0,
  tokensProcessed: 0,
  transfersProcessed: 0,
  newTokensDiscovered: 0,
  cacheHits: 0,
  errors: 0,
  startTime: Date.now(),
};

/**
 * Get processing statistics
 */
export function getProcessingStats() {
  console.log("[TOKEN-STATS] Mengambil statistik pemrosesan token...");
  const uptime = Date.now() - processingStats.startTime;
  const stats = {
    ...processingStats,
    uptime,
    cacheSize: tokenMetadataCache.size,
    successRate: processingStats.totalLogs > 0 ? ((processingStats.transfersProcessed / processingStats.totalLogs) * 100).toFixed(2) + "%" : "0%",
    cacheHitRate: processingStats.totalLogs > 0 ? ((processingStats.cacheHits / processingStats.totalLogs) * 100).toFixed(2) + "%" : "0%",
  };
  console.log("[TOKEN-STATS] Statistik saat ini:", stats);
  return stats;
}

/**
 * Reset processing statistics
 */
export function resetProcessingStats() {
  console.log("[TOKEN-STATS] Mereset statistik pemrosesan token.");
  processingStats = {
    totalLogs: 0,
    tokensProcessed: 0,
    transfersProcessed: 0,
    newTokensDiscovered: 0,
    cacheHits: 0,
    errors: 0,
    startTime: Date.now(),
  };
}

export { processingStats };
