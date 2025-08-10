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
  const uptime = Date.now() - processingStats.startTime;
  return {
    ...processingStats,
    uptime,
    cacheSize: tokenMetadataCache.size,
    successRate: processingStats.totalLogs > 0 ? ((processingStats.transfersProcessed / processingStats.totalLogs) * 100).toFixed(2) + "%" : "0%",
    cacheHitRate: processingStats.totalLogs > 0 ? ((processingStats.cacheHits / processingStats.totalLogs) * 100).toFixed(2) + "%" : "0%",
  };
}

/**
 * Reset processing statistics
 */
export function resetProcessingStats() {
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
