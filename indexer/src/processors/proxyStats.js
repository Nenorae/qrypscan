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
  const uptime = Date.now() - processingStats.startTime;
  return {
    ...processingStats,
    uptime,
    successRate: processingStats.totalProcessed > 0 ? ((processingStats.successfulProcessed / processingStats.totalProcessed) * 100).toFixed(2) + "%" : "0%",
  };
}

/**
 * Reset processing statistics
 */
export function resetProcessingStats() {
  processingStats = {
    totalProcessed: 0,
    successfulProcessed: 0,
    errors: 0,
    startTime: Date.now(),
  };
}

export { processingStats };
