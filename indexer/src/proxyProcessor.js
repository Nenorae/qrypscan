// File: indexer/src/proxyProcessor.js

import { processProxyUpgradeLog, processPossibleProxyUpgradeTransaction } from './processors/proxyMain.js';
import { getProcessingStats, resetProcessingStats } from './processors/proxyStats.js';
import { PROXY_EVENT_SIGNATURES } from './processors/proxyConstants.js';

export {
  processProxyUpgradeLog,
  processPossibleProxyUpgradeTransaction,
  getProcessingStats,
  resetProcessingStats,
  PROXY_EVENT_SIGNATURES,
};

export default {
  processProxyUpgradeLog,
  getProcessingStats,
  resetProcessingStats,
  PROXY_EVENT_SIGNATURES,
};