// const { ethers } = require("ethers");

// /**
//  * Proxy Event Handler untuk menangani event-event penting proxy contracts
//  * Mendukung EIP-1967, OpenZeppelin, dan standar proxy lainnya
//  */
// class ProxyEventHandler {
//   constructor(provider, options = {}) {
//     this.provider = provider;
//     this.options = {
//       enableLogging: options.enableLogging !== false,
//       logLevel: options.logLevel || "info", // 'debug', 'info', 'warn', 'error'
//       retryAttempts: options.retryAttempts || 3,
//       retryDelay: options.retryDelay || 1000,
//       batchSize: options.batchSize || 100,
//       ...options,
//     };

//     // Event signatures untuk berbagai standar proxy
//     this.eventSignatures = {
//       // EIP-1967 Standard Events
//       upgraded: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b", // Upgraded(address)
//       adminChanged: "0x7e644d79422f17c01e4894b5f4f588d331ebfa28653d42ae832dc59e38c9798f", // AdminChanged(address,address)
//       beaconUpgraded: "0x1cf3b03a6cf19fa2baba4df148e9dcabedea7f8a5c07840e207e5c089be95d3e", // BeaconUpgraded(address)

//       // OpenZeppelin Additional Events
//       ownershipTransferred: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0", // OwnershipTransferred(address,address)
//       paused: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258", // Paused(address)
//       unpaused: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa", // Unpaused(address)

//       // Transparent Proxy Events
//       proxyOwnershipTransferred: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0",

//       // UUPS Events
//       initialized: "0x7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb3847402498", // Initialized(uint8)

//       // Custom Proxy Events (dapat disesuaikan)
//       implementationChanged: "0x0000000000000000000000000000000000000000000000000000000000000000",
//     };

//     // Event handlers registry
//     this.eventHandlers = new Map();
//     this.activeListeners = new Map();

//     this._setupDefaultHandlers();
//   }

//   /**
//    * Setup default event handlers
//    */
//   _setupDefaultHandlers() {
//     // Handler untuk Upgraded event
//     this.registerEventHandler("upgraded", async (event, txReceipt) => {
//       const newImplementation = event.args[0];
//       this.log("info", `🔄 Proxy upgraded to new implementation: ${newImplementation}`, {
//         event: "Upgraded",
//         newImplementation,
//         txHash: txReceipt.transactionHash,
//         blockNumber: txReceipt.blockNumber,
//         proxyAddress: event.address,
//       });

//       // Validasi implementasi baru
//       await this._validateImplementation(newImplementation, event.address);
//     });

//     // Handler untuk AdminChanged event
//     this.registerEventHandler("adminChanged", async (event, txReceipt) => {
//       const [previousAdmin, newAdmin] = event.args;
//       this.log("warn", `⚠️  Proxy admin changed: ${previousAdmin} → ${newAdmin}`, {
//         event: "AdminChanged",
//         previousAdmin,
//         newAdmin,
//         txHash: txReceipt.transactionHash,
//         blockNumber: txReceipt.blockNumber,
//         proxyAddress: event.address,
//       });
//     });

//     // Handler untuk BeaconUpgraded event
//     this.registerEventHandler("beaconUpgraded", async (event, txReceipt) => {
//       const beacon = event.args[0];
//       this.log("info", `🔆 Beacon proxy upgraded: ${beacon}`, {
//         event: "BeaconUpgraded",
//         beacon,
//         txHash: txReceipt.transactionHash,
//         blockNumber: txReceipt.blockNumber,
//         proxyAddress: event.address,
//       });
//     });

//     // Handler untuk OwnershipTransferred event
//     this.registerEventHandler("ownershipTransferred", async (event, txReceipt) => {
//       const [previousOwner, newOwner] = event.args;
//       this.log("warn", `👑 Ownership transferred: ${previousOwner} → ${newOwner}`, {
//         event: "OwnershipTransferred",
//         previousOwner,
//         newOwner,
//         txHash: txReceipt.transactionHash,
//         blockNumber: txReceipt.blockNumber,
//         contractAddress: event.address,
//       });
//     });

//     // Handler untuk Paused/Unpaused events
//     this.registerEventHandler("paused", async (event, txReceipt) => {
//       this.log("warn", `⏸️  Contract paused by: ${event.args[0]}`, {
//         event: "Paused",
//         pausedBy: event.args[0],
//         txHash: txReceipt.transactionHash,
//         blockNumber: txReceipt.blockNumber,
//         contractAddress: event.address,
//       });
//     });

//     this.registerEventHandler("unpaused", async (event, txReceipt) => {
//       this.log("info", `▶️  Contract unpaused by: ${event.args[0]}`, {
//         event: "Unpaused",
//         unpausedBy: event.args[0],
//         txHash: txReceipt.transactionHash,
//         blockNumber: txReceipt.blockNumber,
//         contractAddress: event.address,
//       });
//     });

//     // Handler untuk Initialized event
//     this.registerEventHandler("initialized", async (event, txReceipt) => {
//       const version = event.args[0];
//       this.log("info", `🚀 Contract initialized with version: ${version}`, {
//         event: "Initialized",
//         version: version.toString(),
//         txHash: txReceipt.transactionHash,
//         blockNumber: txReceipt.blockNumber,
//         contractAddress: event.address,
//       });
//     });
//   }

//   /**
//    * Register custom event handler
//    */
//   registerEventHandler(eventName, handler) {
//     if (typeof handler !== "function") {
//       throw new Error("Handler must be a function");
//     }

//     this.eventHandlers.set(eventName, handler);
//     this.log("debug", `Event handler registered for: ${eventName}`);
//   }

//   /**
//    * Start monitoring proxy events untuk kontrak tertentu
//    */
//   async startMonitoring(proxyAddress, options = {}) {
//     try {
//       const normalizedAddress = ethers.utils.getAddress(proxyAddress);

//       if (this.activeListeners.has(normalizedAddress)) {
//         this.log("warn", `Already monitoring proxy: ${normalizedAddress}`);
//         return;
//       }

//       this.log("info", `🔍 Starting proxy monitoring for: ${normalizedAddress}`);

//       const listeners = [];

//       // Setup event listeners untuk setiap event signature
//       for (const [eventName, signature] of Object.entries(this.eventSignatures)) {
//         if (signature === "0x0000000000000000000000000000000000000000000000000000000000000000") {
//           continue; // Skip placeholder signatures
//         }

//         const filter = {
//           address: normalizedAddress,
//           topics: [signature],
//         };

//         const listener = async (...args) => {
//           await this._handleEvent(eventName, args, normalizedAddress);
//         };

//         this.provider.on(filter, listener);
//         listeners.push({ filter, listener, eventName });

//         this.log("debug", `Event listener setup for ${eventName} on ${normalizedAddress}`);
//       }

//       this.activeListeners.set(normalizedAddress, listeners);

//       // Scan historical events jika diminta
//       if (options.scanHistorical) {
//         await this._scanHistoricalEvents(normalizedAddress, options.fromBlock || "latest");
//       }

//       this.log("info", `✅ Proxy monitoring active for: ${normalizedAddress}`);
//     } catch (error) {
//       this.log("error", `Failed to start monitoring proxy: ${proxyAddress}`, { error: error.message });
//       throw error;
//     }
//   }

//   /**
//    * Stop monitoring proxy events
//    */
//   async stopMonitoring(proxyAddress) {
//     try {
//       const normalizedAddress = ethers.utils.getAddress(proxyAddress);
//       const listeners = this.activeListeners.get(normalizedAddress);

//       if (!listeners) {
//         this.log("warn", `No active monitoring found for: ${normalizedAddress}`);
//         return;
//       }

//       // Remove all event listeners
//       for (const { filter, listener } of listeners) {
//         this.provider.removeListener(filter, listener);
//       }

//       this.activeListeners.delete(normalizedAddress);
//       this.log("info", `🛑 Stopped monitoring proxy: ${normalizedAddress}`);
//     } catch (error) {
//       this.log("error", `Failed to stop monitoring proxy: ${proxyAddress}`, { error: error.message });
//       throw error;
//     }
//   }

//   /**
//    * Handle detected events dengan retry mechanism
//    */
//   async _handleEvent(eventName, args, proxyAddress) {
//     let retryCount = 0;

//     while (retryCount <= this.options.retryAttempts) {
//       try {
//         // Parse event data
//         const log = args[args.length - 1];
//         const txReceipt = await this._getTransactionReceipt(log.transactionHash);

//         const event = {
//           address: log.address,
//           topics: log.topics,
//           data: log.data,
//           args: this._parseEventArgs(eventName, log),
//           blockNumber: log.blockNumber,
//           transactionHash: log.transactionHash,
//           logIndex: log.logIndex,
//         };

//         // Execute registered handler
//         const handler = this.eventHandlers.get(eventName);
//         if (handler) {
//           await handler(event, txReceipt);
//         }

//         // Execute global hooks jika ada
//         await this._executeGlobalHooks(eventName, event, txReceipt);

//         break; // Success, exit retry loop
//       } catch (error) {
//         retryCount++;
//         this.log("error", `Event handling failed (attempt ${retryCount}): ${eventName}`, {
//           error: error.message,
//           proxyAddress,
//           retryCount,
//         });

//         if (retryCount <= this.options.retryAttempts) {
//           await this._delay(this.options.retryDelay * retryCount);
//         } else {
//           this.log("error", `Max retry attempts reached for event: ${eventName}`, {
//             proxyAddress,
//             finalError: error.message,
//           });
//         }
//       }
//     }
//   }

//   /**
//    * Parse event arguments berdasarkan event type
//    */
//   _parseEventArgs(eventName, log) {
//     try {
//       // Basic parsing - dapat diperluas sesuai kebutuhan
//       const iface = new ethers.utils.Interface([
//         "event Upgraded(address indexed implementation)",
//         "event AdminChanged(address previousAdmin, address newAdmin)",
//         "event BeaconUpgraded(address indexed beacon)",
//         "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
//         "event Paused(address account)",
//         "event Unpaused(address account)",
//         "event Initialized(uint8 version)",
//       ]);

//       return iface.parseLog(log).args;
//     } catch (error) {
//       this.log("debug", `Could not parse event args for ${eventName}`, { error: error.message });
//       return [];
//     }
//   }

//   /**
//    * Get transaction receipt dengan caching
//    */
//   async _getTransactionReceipt(txHash) {
//     // Implement simple caching to avoid redundant calls
//     if (!this._receiptCache) {
//       this._receiptCache = new Map();
//     }

//     if (this._receiptCache.has(txHash)) {
//       return this._receiptCache.get(txHash);
//     }

//     const receipt = await this.provider.getTransactionReceipt(txHash);
//     this._receiptCache.set(txHash, receipt);

//     // Clean cache jika terlalu besar
//     if (this._receiptCache.size > 1000) {
//       const firstKey = this._receiptCache.keys().next().value;
//       this._receiptCache.delete(firstKey);
//     }

//     return receipt;
//   }

//   /**
//    * Scan historical events
//    */
//   async _scanHistoricalEvents(proxyAddress, fromBlock = 0) {
//     try {
//       this.log("info", `📜 Scanning historical events for ${proxyAddress} from block ${fromBlock}`);

//       const currentBlock = await this.provider.getBlockNumber();
//       const startBlock = fromBlock === "latest" ? Math.max(0, currentBlock - 1000) : fromBlock;

//       // Scan dalam batch untuk menghindari rate limiting
//       for (let block = startBlock; block <= currentBlock; block += this.options.batchSize) {
//         const endBlock = Math.min(block + this.options.batchSize - 1, currentBlock);

//         const logs = await this.provider.getLogs({
//           address: proxyAddress,
//           fromBlock: block,
//           toBlock: endBlock,
//           topics: [Object.values(this.eventSignatures).filter((sig) => sig !== "0x0000000000000000000000000000000000000000000000000000000000000000")],
//         });

//         // Process found logs
//         for (const log of logs) {
//           const eventName = this._getEventNameBySignature(log.topics[0]);
//           if (eventName) {
//             await this._handleEvent(eventName, [log], proxyAddress);
//           }
//         }

//         this.log("debug", `Scanned blocks ${block}-${endBlock}, found ${logs.length} events`);
//       }

//       this.log("info", `✅ Historical scan completed for ${proxyAddress}`);
//     } catch (error) {
//       this.log("error", `Historical scan failed for ${proxyAddress}`, { error: error.message });
//     }
//   }

//   /**
//    * Get event name by signature
//    */
//   _getEventNameBySignature(signature) {
//     for (const [eventName, sig] of Object.entries(this.eventSignatures)) {
//       if (sig === signature) {
//         return eventName;
//       }
//     }
//     return null;
//   }

//   /**
//    * Validate implementation contract
//    */
//   async _validateImplementation(implementationAddress, proxyAddress) {
//     try {
//       // Check if implementation has code
//       const code = await this.provider.getCode(implementationAddress);
//       if (code === "0x") {
//         this.log("error", `⚠️  Implementation has no code: ${implementationAddress}`, {
//           implementationAddress,
//           proxyAddress,
//         });
//         return false;
//       }

//       // Additional validation dapat ditambahkan di sini
//       this.log("debug", `✅ Implementation validation passed: ${implementationAddress}`);
//       return true;
//     } catch (error) {
//       this.log("error", `Implementation validation failed: ${implementationAddress}`, {
//         error: error.message,
//         proxyAddress,
//       });
//       return false;
//     }
//   }

//   /**
//    * Execute global hooks
//    */
//   async _executeGlobalHooks(eventName, event, txReceipt) {
//     // Implementasi global hooks untuk cross-cutting concerns
//     // seperti notifications, metrics, dll.
//   }

//   /**
//    * Utility delay function
//    */
//   _delay(ms) {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }

//   /**
//    * Logging utility dengan multiple levels
//    */
//   log(level, message, data = {}) {
//     if (!this.options.enableLogging) return;

//     const levels = { debug: 0, info: 1, warn: 2, error: 3 };
//     const configLevel = levels[this.options.logLevel] || 1;
//     const messageLevel = levels[level] || 1;

//     if (messageLevel < configLevel) return;

//     const timestamp = new Date().toISOString();
//     const logEntry = {
//       timestamp,
//       level: level.toUpperCase(),
//       message,
//       ...data,
//     };

//     console.log(`[${timestamp}] [PROXY-HANDLER] [${level.toUpperCase()}] ${message}`, Object.keys(data).length > 0 ? data : "");
//   }

//   /**
//    * Get monitoring status
//    */
//   getMonitoringStatus() {
//     const status = {
//       activeProxies: Array.from(this.activeListeners.keys()),
//       totalListeners: Array.from(this.activeListeners.values()).reduce((total, listeners) => total + listeners.length, 0),
//       registeredHandlers: Array.from(this.eventHandlers.keys()),
//       options: this.options,
//     };

//     this.log("info", "Current monitoring status", status);
//     return status;
//   }

//   /**
//    * Cleanup resources
//    */
//   async cleanup() {
//     this.log("info", "🧹 Cleaning up proxy event handler...");

//     // Stop all active monitoring
//     const activeProxies = Array.from(this.activeListeners.keys());
//     for (const proxy of activeProxies) {
//       await this.stopMonitoring(proxy);
//     }

//     // Clear caches
//     if (this._receiptCache) {
//       this._receiptCache.clear();
//     }

//     this.eventHandlers.clear();

//     this.log("info", "✅ Cleanup completed");
//   }
// }

// // Export untuk penggunaan
// module.exports = { ProxyEventHandler };

// // Contoh penggunaan:
// /*
// const { ethers } = require('ethers');
// const { ProxyEventHandler } = require('./proxy-event-handler');

// // Setup
// const provider = new ethers.providers.JsonRpcProvider('YOUR_RPC_URL');
// const proxyHandler = new ProxyEventHandler(provider, {
//     enableLogging: true,
//     logLevel: 'info',
//     retryAttempts: 3,
//     batchSize: 100
// });

// // Register custom handler
// proxyHandler.registerEventHandler('upgraded', async (event, txReceipt) => {
//     console.log('Custom upgrade handler triggered!');
//     // Your custom logic here
// });

// // Start monitoring
// await proxyHandler.startMonitoring('0xYourProxyAddress', {
//     scanHistorical: true,
//     fromBlock: 'latest'
// });

// // Check status
// proxyHandler.getMonitoringStatus();

// // Cleanup when done
// // await proxyHandler.cleanup();
// */
