// File: indexer/src/proxyProcessor.js

import { checkProxyStatus, processProxyUpgradeLog } from './processors/proxyMain.js';
import { getProcessingStats, resetProcessingStats } from './processors/proxyStats.js';
import { PROXY_EVENT_SIGNATURES } from './processors/proxyConstants.js';

export {
  checkProxyStatus,
  processProxyUpgradeLog,
  getProcessingStats,
  resetProcessingStats,
  PROXY_EVENT_SIGNATURES,
};

export default {
  checkProxyStatus,
  processProxyUpgradeLog,
  getProcessingStats,
  resetProcessingStats,
  PROXY_EVENT_SIGNATURES,
};