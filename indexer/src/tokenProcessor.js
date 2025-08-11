// File: indexer/src/tokenProcessor.js

import { processTransactionLog, processApprovalLog } from './processors/tokenMain.js';
import { getProcessingStats, resetProcessingStats } from './processors/tokenStats.js';
import { clearTokenCache, getCacheStats } from './processors/tokenCache.js';
import { TOKEN_EVENT_SIGNATURES } from './processors/tokenConstants.js';

export {
  processTransactionLog,
  processApprovalLog,
  getProcessingStats,
  resetProcessingStats,
  clearTokenCache,
  getCacheStats,
  TOKEN_EVENT_SIGNATURES,
};

export default {
  processTransactionLog,
  processApprovalLog,
  getProcessingStats,
  resetProcessingStats,
  clearTokenCache,
  getCacheStats,
  TOKEN_EVENT_SIGNATURES,
};