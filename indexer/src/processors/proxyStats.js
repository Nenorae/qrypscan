// File: indexer/src/processors/proxyStats.js

// Performance tracking
let processingStats = {
  totalProcessed: 0,
  successfulProcessed: 0,
  errors: 0,
  startTime: Date.now(),
};

/**
 * Get processing statistics
 */
export function getProcessingStats() {
  console.log("[PROXY-STATS] Mengambil statistik pemrosesan proxy...");
  const uptime = Date.now() - processingStats.startTime;
  const stats = {
    ...processingStats,
    uptime,
    successRate: processingStats.totalProcessed > 0 ? ((processingStats.successfulProcessed / processingStats.totalProcessed) * 100).toFixed(2) + "%" : "0%",
  };
  console.log("[PROXY-STATS] Statistik saat ini:", stats);
  return stats;
}

/**
 * Reset processing statistics
 */
export function resetProcessingStats() {
  console.log("[PROXY-STATS] Mereset statistik pemrosesan proxy.");
  processingStats = {
    totalProcessed: 0,
    successfulProcessed: 0,
    errors: 0,
    startTime: Date.now(),
  };
}

export { processingStats };
