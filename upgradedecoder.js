const { ethers } = require("ethers");

/**
 * ProxyAdminTransactionDecoder - Modul untuk mendecode transaksi upgrade
 * dan mengidentifikasi proxy mana yang di-upgrade
 */
class ProxyAdminTransactionDecoder {
  constructor(provider, config = {}) {
    this.provider = provider;
    this.cache = new Map(); // Cache untuk menyimpan decoded transactions
    this.cacheSize = config.cacheSize || 1000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;

    // ABI untuk ProxyAdmin contract functions
    this.proxyAdminInterface = new ethers.Interface([
      // Standard upgrade functions
      "function upgrade(address proxy, address implementation)",
      "function upgradeAndCall(address proxy, address implementation, bytes data)",

      // Alternative function signatures yang mungkin ada
      "function upgradeProxy(address proxy, address implementation)",
      "function upgradeProxyAndCall(address proxy, address implementation, bytes data)",

      // Admin functions
      "function changeProxyAdmin(address proxy, address newAdmin)",
      "function getProxyAdmin(address proxy) view returns (address)",
      "function getProxyImplementation(address proxy) view returns (address)",

      // Ownership functions
      "function transferOwnership(address newOwner)",
      "function renounceOwnership()",
    ]);

    // Function selectors untuk identifikasi cepat
    this.functionSelectors = {
      upgrade: "0x99a88ec4", // upgrade(address,address)
      upgradeAndCall: "0x9623609d", // upgradeAndCall(address,address,bytes)
      upgradeProxy: "0x5c60da1b", // alternative naming
      upgradeProxyAndCall: "0x4f1ef286", // alternative naming
      changeProxyAdmin: "0x7eff275e", // changeProxyAdmin(address,address)
      transferOwnership: "0xf2fde38b", // transferOwnership(address)
      renounceOwnership: "0x715018a6", // renounceOwnership()
    };

    // Statistics tracking
    this.stats = {
      totalProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      decodingErrors: 0,
      unknownFunctions: 0,
    };
  }

  /**
   * Main method untuk decode transaksi upgrade
   * @param {string} transactionHash - Hash transaksi yang akan di-decode
   * @param {Object} eventData - Data event Upgraded untuk konteks
   * @returns {Object} Informasi lengkap tentang upgrade
   */
  async decodeUpgradeTransaction(transactionHash, eventData = {}) {
    try {
      // Check cache terlebih dahulu
      const cacheKey = `${transactionHash}_upgrade`;
      if (this.cache.has(cacheKey)) {
        this.stats.cacheHits++;
        return this.cache.get(cacheKey);
      }

      this.stats.cacheMisses++;
      this.stats.totalProcessed++;

      // Fetch transaction dengan retry mechanism
      const transaction = await this.retryWithBackoff(() => this.provider.getTransaction(transactionHash));

      if (!transaction) {
        throw new Error(`Transaction ${transactionHash} not found`);
      }

      // Decode transaction data
      const decodedData = await this.decodeTransactionData(transaction);

      // Get transaction receipt untuk gas information
      const receipt = await this.retryWithBackoff(() => this.provider.getTransactionReceipt(transactionHash));

      // Combine semua informasi
      const result = {
        transactionHash,
        blockNumber: transaction.blockNumber,
        from: transaction.from,
        to: transaction.to,
        gasPrice: transaction.gasPrice?.toString(),
        gasLimit: transaction.gasLimit?.toString(),
        gasUsed: receipt?.gasUsed?.toString(),
        value: transaction.value?.toString(),
        nonce: transaction.nonce,
        functionCall: decodedData,
        eventData,
        timestamp: await this.getBlockTimestamp(transaction.blockNumber),
        status: receipt?.status === 1 ? "success" : "failed",
      };

      // Cache hasil dengan size limit
      this.setCacheWithLimit(cacheKey, result);

      console.log(`✅ Successfully decoded upgrade transaction: ${transactionHash.slice(0, 10)}...`);

      return result;
    } catch (error) {
      this.stats.decodingErrors++;
      console.error(`❌ Error decoding transaction ${transactionHash}:`, error.message);
      throw error;
    }
  }

  /**
   * Decode data transaksi berdasarkan function signature
   * @param {Object} transaction - Transaction object dari ethers
   * @returns {Object} Decoded function call data
   */
  async decodeTransactionData(transaction) {
    const { data } = transaction;

    if (!data || data === "0x") {
      throw new Error("Transaction has no data");
    }

    // Extract function selector (first 4 bytes)
    const functionSelector = data.slice(0, 10);
    const functionName = this.identifyFunction(functionSelector);

    if (!functionName) {
      this.stats.unknownFunctions++;
      return {
        functionName: "unknown",
        functionSelector,
        rawData: data,
        decodedArgs: null,
        error: "Unknown function selector",
      };
    }

    try {
      // Decode menggunakan ethers Interface
      const decodedCall = this.proxyAdminInterface.parseTransaction({
        data: data,
        value: transaction.value,
      });

      // Extract arguments dengan nama yang meaningful
      const args = this.extractFunctionArguments(functionName, decodedCall.args);

      return {
        functionName,
        functionSelector,
        signature: decodedCall.signature,
        decodedArgs: args,
        rawArgs: decodedCall.args.map((arg) => arg.toString()),
        fragment: decodedCall.fragment,
      };
    } catch (error) {
      console.warn(`⚠️  Could not decode function ${functionName}:`, error.message);

      // Fallback: manual parsing untuk functions yang mungkin tidak standard
      return await this.manualFunctionParsing(functionSelector, data);
    }
  }

  /**
   * Identify function berdasarkan selector
   * @param {string} selector - Function selector (4 bytes hex)
   * @returns {string|null} Function name
   */
  identifyFunction(selector) {
    for (const [name, sig] of Object.entries(this.functionSelectors)) {
      if (sig === selector) {
        return name;
      }
    }
    return null;
  }

  /**
   * Extract dan format arguments berdasarkan function type
   * @param {string} functionName - Nama function
   * @param {Array} args - Raw arguments dari decoded transaction
   * @returns {Object} Formatted arguments
   */
  extractFunctionArguments(functionName, args) {
    const baseResult = {
      functionType: this.categorizeFunctionType(functionName),
    };

    switch (functionName) {
      case "upgrade":
      case "upgradeProxy":
        return {
          ...baseResult,
          proxyAddress: args[0],
          newImplementation: args[1],
          callData: null,
        };

      case "upgradeAndCall":
      case "upgradeProxyAndCall":
        return {
          ...baseResult,
          proxyAddress: args[0],
          newImplementation: args[1],
          callData: args[2],
          callDataDecoded: this.tryDecodeCallData(args[2]),
        };

      case "changeProxyAdmin":
        return {
          ...baseResult,
          proxyAddress: args[0],
          newAdmin: args[1],
        };

      case "transferOwnership":
        return {
          ...baseResult,
          newOwner: args[0],
        };

      case "renounceOwnership":
        return {
          ...baseResult,
        };

      default:
        return {
          ...baseResult,
          rawArgs: args.map((arg, index) => ({
            index,
            value: arg.toString(),
            type: typeof arg,
          })),
        };
    }
  }

  /**
   * Categorize function type untuk easier filtering
   * @param {string} functionName - Nama function
   * @returns {string} Category
   */
  categorizeFunctionType(functionName) {
    const upgradeTypes = ["upgrade", "upgradeProxy", "upgradeAndCall", "upgradeProxyAndCall"];
    const adminTypes = ["changeProxyAdmin"];
    const ownershipTypes = ["transferOwnership", "renounceOwnership"];

    if (upgradeTypes.includes(functionName)) return "UPGRADE";
    if (adminTypes.includes(functionName)) return "ADMIN_CHANGE";
    if (ownershipTypes.includes(functionName)) return "OWNERSHIP";

    return "OTHER";
  }

  /**
   * Try to decode call data untuk upgradeAndCall functions
   * @param {string} callData - Hex encoded call data
   * @returns {Object|null} Decoded call data or null
   */
  tryDecodeCallData(callData) {
    if (!callData || callData === "0x") {
      return null;
    }

    try {
      // Common function signatures yang sering dipanggil saat upgrade
      const commonSignatures = [
        "function initialize()",
        "function initialize(address)",
        "function initialize(address,address)",
        "function initialize(string,string)",
        "function reinitialize(uint8)",
        "function upgrade()",
        "function postUpgrade()",
      ];

      for (const sig of commonSignatures) {
        try {
          const iface = new ethers.Interface([sig]);
          const decoded = iface.parseTransaction({ data: callData });

          return {
            functionName: decoded.name,
            signature: decoded.signature,
            args: decoded.args.map((arg) => arg.toString()),
          };
        } catch (e) {
          // Continue to next signature
          continue;
        }
      }

      return {
        raw: callData,
        length: (callData.length - 2) / 2, // bytes length
        error: "Could not decode call data",
      };
    } catch (error) {
      return {
        raw: callData,
        error: error.message,
      };
    }
  }

  /**
   * Manual parsing untuk function selectors yang tidak standard
   * @param {string} selector - Function selector
   * @param {string} data - Full transaction data
   * @returns {Object} Parsed data
   */
  async manualFunctionParsing(selector, data) {
    try {
      // Remove function selector untuk get parameter data
      const paramData = "0x" + data.slice(10);

      // Try to decode as standard upgrade function (2 addresses)
      if (paramData.length >= 130) {
        // 2 * 32 bytes untuk 2 addresses
        const param1 = "0x" + paramData.slice(26, 66); // First address
        const param2 = "0x" + paramData.slice(90, 130); // Second address

        // Validate addresses
        if (ethers.isAddress(param1) && ethers.isAddress(param2)) {
          return {
            functionName: "unknown_upgrade",
            functionSelector: selector,
            decodedArgs: {
              functionType: "UPGRADE",
              proxyAddress: param1,
              newImplementation: param2,
              note: "Manually decoded as upgrade function",
            },
            rawData: data,
          };
        }
      }

      return {
        functionName: "unknown",
        functionSelector: selector,
        rawData: data,
        decodedArgs: null,
        error: "Could not manually decode function",
      };
    } catch (error) {
      return {
        functionName: "unknown",
        functionSelector: selector,
        rawData: data,
        decodedArgs: null,
        error: `Manual parsing failed: ${error.message}`,
      };
    }
  }

  /**
   * Get block timestamp dengan caching
   * @param {number} blockNumber - Block number
   * @returns {Date} Block timestamp
   */
  async getBlockTimestamp(blockNumber) {
    const cacheKey = `block_${blockNumber}_timestamp`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const block = await this.provider.getBlock(blockNumber);
      const timestamp = new Date(block.timestamp * 1000);

      this.setCacheWithLimit(cacheKey, timestamp);
      return timestamp;
    } catch (error) {
      console.warn(`⚠️  Could not get timestamp for block ${blockNumber}:`, error.message);
      return new Date(); // Fallback to current time
    }
  }

  /**
   * Batch processing untuk multiple transactions
   * @param {Array} transactionHashes - Array of transaction hashes
   * @param {Object} options - Processing options
   * @returns {Array} Array of decoded transactions
   */
  async batchDecodeTransactions(transactionHashes, options = {}) {
    const { batchSize = 10, delayBetweenBatches = 100, continueOnError = true } = options;

    console.log(`🔄 Starting batch decode of ${transactionHashes.length} transactions...`);

    const results = [];
    const errors = [];

    for (let i = 0; i < transactionHashes.length; i += batchSize) {
      const batch = transactionHashes.slice(i, i + batchSize);

      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transactionHashes.length / batchSize)}...`);

      const batchPromises = batch.map(async (txHash) => {
        try {
          const result = await this.decodeUpgradeTransaction(txHash);
          return { success: true, txHash, result };
        } catch (error) {
          const errorInfo = { success: false, txHash, error: error.message };

          if (continueOnError) {
            errors.push(errorInfo);
            return errorInfo;
          } else {
            throw error;
          }
        }
      });

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Delay between batches to avoid rate limiting
        if (delayBetweenBatches > 0 && i + batchSize < transactionHashes.length) {
          await this.delay(delayBetweenBatches);
        }
      } catch (error) {
        console.error(`❌ Batch processing failed at batch starting with index ${i}:`, error);
        if (!continueOnError) throw error;
      }
    }

    console.log(`✅ Batch processing completed. Success: ${results.filter((r) => r.success).length}, Errors: ${errors.length}`);

    return {
      results: results.filter((r) => r.success).map((r) => r.result),
      errors,
      stats: this.getStats(),
    };
  }

  /**
   * Analyze upgrade patterns dari historical data
   * @param {Array} decodedTransactions - Array of decoded transactions
   * @returns {Object} Analysis report
   */
  analyzeUpgradePatterns(decodedTransactions) {
    const analysis = {
      totalUpgrades: 0,
      proxyUpgrades: new Map(),
      implementationChanges: new Map(),
      upgradeTypes: new Map(),
      timePatterns: [],
      gasAnalysis: {
        average: 0,
        min: Infinity,
        max: 0,
        total: 0,
      },
    };

    decodedTransactions.forEach((tx) => {
      if (tx.functionCall?.decodedArgs?.functionType === "UPGRADE") {
        analysis.totalUpgrades++;

        const proxyAddr = tx.functionCall.decodedArgs.proxyAddress;
        const implAddr = tx.functionCall.decodedArgs.newImplementation;
        const functionName = tx.functionCall.functionName;

        // Track proxy upgrade frequency
        analysis.proxyUpgrades.set(proxyAddr, (analysis.proxyUpgrades.get(proxyAddr) || 0) + 1);

        // Track implementation usage
        analysis.implementationChanges.set(implAddr, (analysis.implementationChanges.get(implAddr) || 0) + 1);

        // Track upgrade types
        analysis.upgradeTypes.set(functionName, (analysis.upgradeTypes.get(functionName) || 0) + 1);

        // Gas analysis
        if (tx.gasUsed) {
          const gasUsed = parseInt(tx.gasUsed);
          analysis.gasAnalysis.min = Math.min(analysis.gasAnalysis.min, gasUsed);
          analysis.gasAnalysis.max = Math.max(analysis.gasAnalysis.max, gasUsed);
          analysis.gasAnalysis.total += gasUsed;
        }

        // Time pattern
        analysis.timePatterns.push({
          timestamp: tx.timestamp,
          proxyAddress: proxyAddr,
          implementation: implAddr,
        });
      }
    });

    // Calculate average gas
    if (analysis.totalUpgrades > 0) {
      analysis.gasAnalysis.average = Math.round(analysis.gasAnalysis.total / analysis.totalUpgrades);
    }

    // Sort time patterns
    analysis.timePatterns.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      ...analysis,
      proxyUpgrades: Object.fromEntries(analysis.proxyUpgrades),
      implementationChanges: Object.fromEntries(analysis.implementationChanges),
      upgradeTypes: Object.fromEntries(analysis.upgradeTypes),
    };
  }

  // Utility methods
  setCacheWithLimit(key, value) {
    if (this.cache.size >= this.cacheSize) {
      // Remove oldest entry (simple LRU-like behavior)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  async retryWithBackoff(operation) {
    for (let i = 0; i < this.retryAttempts; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === this.retryAttempts - 1) throw error;

        const delay = this.retryDelay * Math.pow(2, i);
        console.log(`🔄 Retry attempt ${i + 1}/${this.retryAttempts} after ${delay}ms...`);
        await this.delay(delay);
      }
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.totalProcessed > 0 ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + "%" : "0%",
      cacheSize: this.cache.size,
    };
  }

  /**
   * Clear cache and reset stats
   */
  reset() {
    this.cache.clear();
    this.stats = {
      totalProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      decodingErrors: 0,
      unknownFunctions: 0,
    };
  }

  /**
   * Export decoded data untuk analysis
   * @param {Array} decodedTransactions - Decoded transaction data
   * @param {string} format - Export format ('json' atau 'csv')
   * @returns {string} Exported data
   */
  exportData(decodedTransactions, format = "json") {
    if (format === "json") {
      return JSON.stringify(decodedTransactions, null, 2);
    }

    if (format === "csv") {
      const headers = ["transactionHash", "blockNumber", "timestamp", "from", "to", "functionName", "proxyAddress", "newImplementation", "gasUsed", "status"];

      const rows = decodedTransactions.map((tx) => [
        tx.transactionHash,
        tx.blockNumber,
        tx.timestamp,
        tx.from,
        tx.to,
        tx.functionCall?.functionName || "",
        tx.functionCall?.decodedArgs?.proxyAddress || "",
        tx.functionCall?.decodedArgs?.newImplementation || "",
        tx.gasUsed || "",
        tx.status || "",
      ]);

      return [headers, ...rows].map((row) => row.join(",")).join("\n");
    }

    throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Enhanced Indexer yang menggunakan ProxyAdminTransactionDecoder
 */
class EnhancedUpgradeIndexer {
  constructor(config) {
    this.decoder = new ProxyAdminTransactionDecoder(new ethers.JsonRpcProvider(config.rpcUrl), config.decoderConfig || {});
    this.database = config.database;
    this.config = config;
  }

  /**
   * Enhanced handler untuk Upgraded event yang include transaction decoding
   */
  async handleUpgradedEvent(eventData) {
    try {
      console.log(`🔍 Decoding upgrade transaction: ${eventData.transactionHash}`);

      // Decode transaction untuk mendapatkan proxy address
      const decodedTx = await this.decoder.decodeUpgradeTransaction(eventData.transactionHash, eventData);

      // Enhanced event data dengan transaction details
      const enhancedEventData = {
        ...eventData,
        decodedTransaction: decodedTx,
        proxyAddress: decodedTx.functionCall?.decodedArgs?.proxyAddress,
        upgradeType: decodedTx.functionCall?.functionName,
        callData: decodedTx.functionCall?.decodedArgs?.callData,
        gasUsed: decodedTx.gasUsed,
        upgrader: decodedTx.from,
      };

      // Save enhanced data
      await this.saveEnhancedUpgradeEvent(enhancedEventData);

      // Specific notifications/actions berdasarkan proxy
      await this.handleProxySpecificActions(enhancedEventData);

      console.log(`✅ Enhanced upgrade event processed for proxy: ${enhancedEventData.proxyAddress}`);

      return enhancedEventData;
    } catch (error) {
      console.error("❌ Error handling enhanced upgrade event:", error);

      // Fallback: save basic event data
      await this.saveEnhancedUpgradeEvent({
        ...eventData,
        decodingError: error.message,
      });

      throw error;
    }
  }

  async saveEnhancedUpgradeEvent(eventData) {
    if (!this.database) {
      console.log("📊 Enhanced upgrade event (no database):", JSON.stringify(eventData, null, 2));
      return;
    }

    try {
      await this.database.query(
        `
                INSERT INTO enhanced_upgrade_events (
                    event_name, transaction_hash, block_number, timestamp,
                    proxy_address, implementation_address, upgrade_type,
                    upgrader_address, gas_used, call_data, event_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (transaction_hash) DO UPDATE SET
                    proxy_address = EXCLUDED.proxy_address,
                    upgrade_type = EXCLUDED.upgrade_type,
                    upgrader_address = EXCLUDED.upgrader_address,
                    gas_used = EXCLUDED.gas_used,
                    call_data = EXCLUDED.call_data,
                    event_data = EXCLUDED.event_data
            `,
        [
          eventData.eventName,
          eventData.transactionHash,
          eventData.blockNumber,
          eventData.timestamp,
          eventData.proxyAddress,
          eventData.implementation,
          eventData.upgradeType,
          eventData.upgrader,
          eventData.gasUsed,
          eventData.callData,
          JSON.stringify(eventData),
        ]
      );
    } catch (error) {
      console.error("❌ Enhanced database save error:", error);
      throw error;
    }
  }

  async handleProxySpecificActions(eventData) {
    // Implement proxy-specific logic berdasarkan proxy address
    const proxyAddress = eventData.proxyAddress;

    if (proxyAddress) {
      console.log(`🎯 Handling specific actions for proxy: ${proxyAddress}`);

      // Example: Different actions for different proxies
      // You can implement specific business logic here
    }
  }
}

// Enhanced database schema
const ENHANCED_DATABASE_SCHEMA = `
-- Enhanced events table dengan decoded transaction data
CREATE TABLE IF NOT EXISTS enhanced_upgrade_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(50) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL UNIQUE,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    proxy_address VARCHAR(42),
    implementation_address VARCHAR(42) NOT NULL,
    upgrade_type VARCHAR(50),
    upgrader_address VARCHAR(42),
    gas_used BIGINT,
    call_data TEXT,
    event_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes untuk enhanced table
CREATE INDEX IF NOT EXISTS idx_enhanced_proxy ON enhanced_upgrade_events(proxy_address);
CREATE INDEX IF NOT EXISTS idx_enhanced_implementation ON enhanced_upgrade_events(implementation_address);
CREATE INDEX IF NOT EXISTS idx_enhanced_upgrader ON enhanced_upgrade_events(upgrader_address);
CREATE INDEX IF NOT EXISTS idx_enhanced_upgrade_type ON enhanced_upgrade_events(upgrade_type);
CREATE INDEX IF NOT EXISTS idx_enhanced_timestamp ON enhanced_upgrade_events(timestamp);
`;

// Usage example
async function exampleUsage() {
  const provider = new ethers.JsonRpcProvider("YOUR_RPC_URL");

  // Create decoder instance
  const decoder = new ProxyAdminTransactionDecoder(provider, {
    cacheSize: 500,
    retryAttempts: 3,
  });

  // Example: Decode single transaction
  const txHash = "0x...";
  try {
    const decodedTx = await decoder.decodeUpgradeTransaction(txHash);
    console.log("Decoded transaction:", decodedTx);

    // Extract proxy address
    console.log("Proxy address:", decodedTx.functionCall?.decodedArgs?.proxyAddress);
    console.log("New implementation:", decodedTx.functionCall?.decodedArgs?.newImplementation);
  } catch (error) {
    console.error("Decoding failed:", error);
  }

  // Example: Batch processing
  const txHashes = ["0x...", "0x...", "0x..."];
  const batchResult = await decoder.batchDecodeTransactions(txHashes);
  console.log("Batch results:", batchResult);

  // Example: Analysis
  const analysis = decoder.analyzeUpgradePatterns(batchResult.results);
  console.log("Upgrade patterns:", analysis);
}

module.exports = {
  ProxyAdminTransactionDecoder,
  EnhancedUpgradeIndexer,
  ENHANCED_DATABASE_SCHEMA,
};

// Export untuk digunakan di indexer utama
if (require.main === module) {
  exampleUsage().catch(console.error);
}
