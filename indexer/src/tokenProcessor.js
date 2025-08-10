// File: indexer/src/tokenProcessor.js

import { processTransactionLog, detectProxyPattern, processApprovalLog } from './processors/tokenMain.js';
import { getProcessingStats, resetProcessingStats } from './processors/tokenStats.js';
import { clearTokenCache, getCacheStats } from './processors/tokenCache.js';
import { TOKEN_EVENT_SIGNATURES } from './processors/tokenConstants.js';

export {
  processTransactionLog,
  detectProxyPattern,
  processApprovalLog,
  getProcessingStats,
  resetProcessingStats,
  clearTokenCache,
  getCacheStats,
  TOKEN_EVENT_SIGNATURES,
};

export default {
  processTransactionLog,
  detectProxyPattern,
  processApprovalLog,
  getProcessingStats,
  resetProcessingStats,
  clearTokenCache,
  getCacheStats,
  TOKEN_EVENT_SIGNATURES,
};