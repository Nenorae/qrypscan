// src/core/serverLogger.js

// Enhanced logging utility
const logger = {
  info: (message, data) => {
    console.log(`🔵 [INFO] ${new Date().toISOString()} - ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  debug: (message, data) => {
    console.log(`🟡 [DEBUG] ${new Date().toISOString()} - ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  error: (message, error) => {
    console.error(`🔴 [ERROR] ${new Date().toISOString()} - ${message}`);
    if (error) {
      console.error("Error details:", error);
      if (error.stack) console.error("Stack trace:", error.stack);
    }
  },
  hardhat: (message, data) => {
    console.log(`⚡ [HARDHAT] ${new Date().toISOString()} - ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
};

export default logger;
