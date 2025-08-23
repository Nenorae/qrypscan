import logger from "../../core/logger.js";

logger.info("[verification.utils.js] loaded");

// Enhanced debugging utility functions
export const debugUtils = {
  logStep: (step, total, message) => {
    const stepInfo = `[${step}/${total}] ${message}`;
    console.log(`🔄 ${stepInfo}`);
    logger.info(stepInfo);
  },

  logSuccess: (message) => {
    console.log(`✅ ${message}`);
    logger.info(`✅ ${message}`);
  },

  logError: (message, error = null) => {
    console.error(`❌ ${message}`, error || "");
    logger.error(`❌ ${message}`, error || "");
  },

  logWarning: (message) => {
    console.warn(`⚠️ ${message}`);
    logger.warn(`⚠️ ${message}`);
  },

  logDebug: (message, data = null) => {
    console.log(`🐛 DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : "");
    logger.debug(`🐛 DEBUG: ${message}`, data);
  },

  logInfo: (message, data = null) => {
    console.log(`ℹ️ ${message}`, data || "");
    logger.info(`ℹ️ ${message}`, data);
  },
};