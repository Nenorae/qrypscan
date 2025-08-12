const { ethers } = require("ethers");

class ProxyAdminIndexer {
  constructor(config) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.proxyAdminAddress = config.proxyAdminAddress;
    this.startBlock = config.startBlock || 0;
    this.batchSize = config.batchSize || 5000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 2000;
    this.database = config.database; // Database connection instance

    // Event signatures dan topic hashes
    this.eventSignatures = {
      Upgraded: {
        signature: "Upgraded(address)",
        topic0: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b",
        abi: ["event Upgraded(address indexed implementation)"],
      },
      AdminChanged: {
        signature: "AdminChanged(address,address)",
        topic0: "0x7e644d79422f17c01e4894b5f4f588d331ebfa28653d42ae832dc59e38c9798f",
        abi: ["event AdminChanged(address previousAdmin, address newAdmin)"],
      },
      OwnershipTransferred: {
        signature: "OwnershipTransferred(address,address)",
        topic0: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0",
        abi: ["event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"],
      },
    };

    // Interface untuk decode events
    this.eventInterface = new ethers.Interface([...this.eventSignatures.Upgraded.abi, ...this.eventSignatures.AdminChanged.abi, ...this.eventSignatures.OwnershipTransferred.abi]);

    this.isRunning = false;
    this.lastProcessedBlock = this.startBlock;
  }

  // Inisialisasi indexer
  async initialize() {
    try {
      console.log("🚀 Initializing ProxyAdmin Indexer...");

      // Verifikasi koneksi ke RPC
      const network = await this.provider.getNetwork();
      console.log(`✅ Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

      // Load last processed block dari database jika ada
      const lastBlock = await this.getLastProcessedBlock();
      if (lastBlock > this.lastProcessedBlock) {
        this.lastProcessedBlock = lastBlock;
        console.log(`📖 Resumed from block: ${this.lastProcessedBlock}`);
      }

      // Verifikasi bahwa contract address adalah valid
      const code = await this.provider.getCode(this.proxyAdminAddress);
      if (code === "0x") {
        throw new Error(`No contract found at address: ${this.proxyAdminAddress}`);
      }

      console.log(`✅ ProxyAdmin contract verified at: ${this.proxyAdminAddress}`);
      return true;
    } catch (error) {
      console.error("❌ Initialization failed:", error.message);
      throw error;
    }
  }

  // Mulai proses indexing
  async start() {
    if (this.isRunning) {
      console.log("⚠️  Indexer is already running");
      return;
    }

    this.isRunning = true;
    console.log("🔄 Starting event indexing...");

    try {
      // Index historical events terlebih dahulu
      await this.indexHistoricalEvents();

      // Kemudian listen untuk real-time events
      await this.listenForRealTimeEvents();
    } catch (error) {
      console.error("❌ Indexer stopped due to error:", error);
      this.isRunning = false;
      throw error;
    }
  }

  // Stop indexer
  stop() {
    console.log("🛑 Stopping indexer...");
    this.isRunning = false;
    if (this.provider.removeAllListeners) {
      this.provider.removeAllListeners();
    }
  }

  // Index historical events
  async indexHistoricalEvents() {
    console.log("📚 Indexing historical events...");

    const latestBlock = await this.provider.getBlockNumber();
    let currentBlock = this.lastProcessedBlock;

    while (currentBlock < latestBlock && this.isRunning) {
      const endBlock = Math.min(currentBlock + this.batchSize, latestBlock);

      console.log(`🔍 Processing blocks ${currentBlock} to ${endBlock}...`);

      try {
        await this.processBlockRange(currentBlock, endBlock);
        this.lastProcessedBlock = endBlock;
        await this.saveLastProcessedBlock(endBlock);

        currentBlock = endBlock + 1;

        // Small delay to avoid rate limiting
        await this.delay(100);
      } catch (error) {
        console.error(`❌ Error processing blocks ${currentBlock}-${endBlock}:`, error);
        await this.retryWithBackoff(() => this.processBlockRange(currentBlock, endBlock));
      }
    }

    console.log("✅ Historical event indexing completed");
  }

  // Listen untuk real-time events
  async listenForRealTimeEvents() {
    console.log("👂 Listening for real-time events...");

    const topics = [[this.eventSignatures.Upgraded.topic0, this.eventSignatures.AdminChanged.topic0, this.eventSignatures.OwnershipTransferred.topic0]];

    const filter = {
      address: this.proxyAdminAddress,
      topics: topics,
    };

    this.provider.on(filter, async (log) => {
      try {
        await this.processLog(log);
      } catch (error) {
        console.error("❌ Error processing real-time event:", error);
      }
    });

    // Fallback: periodic check untuk events yang mungkin terlewat
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const latestBlock = await this.provider.getBlockNumber();
        if (latestBlock > this.lastProcessedBlock) {
          await this.processBlockRange(this.lastProcessedBlock + 1, latestBlock);
          this.lastProcessedBlock = latestBlock;
          await this.saveLastProcessedBlock(latestBlock);
        }
      } catch (error) {
        console.error("❌ Error in periodic check:", error);
      }
    }, 30000); // Check setiap 30 detik
  }

  // Process range of blocks
  async processBlockRange(fromBlock, toBlock) {
    const topics = [[this.eventSignatures.Upgraded.topic0, this.eventSignatures.AdminChanged.topic0, this.eventSignatures.OwnershipTransferred.topic0]];

    const filter = {
      address: this.proxyAdminAddress,
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: topics,
    };

    const logs = await this.provider.getLogs(filter);

    for (const log of logs) {
      await this.processLog(log);
    }

    if (logs.length > 0) {
      console.log(`📝 Processed ${logs.length} events from blocks ${fromBlock}-${toBlock}`);
    }
  }

  // Process individual log
  async processLog(log) {
    try {
      const eventName = this.identifyEvent(log.topics[0]);
      if (!eventName) {
        console.warn("⚠️  Unknown event topic:", log.topics[0]);
        return;
      }

      // Decode event
      const decodedEvent = this.eventInterface.parseLog(log);

      // Get block timestamp
      const block = await this.provider.getBlock(log.blockNumber);

      // Create event data object
      const eventData = {
        eventName: eventName,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        logIndex: log.logIndex,
        timestamp: new Date(block.timestamp * 1000),
        contractAddress: log.address,
        ...this.extractEventData(eventName, decodedEvent),
      };

      // Save to database
      await this.saveEventToDatabase(eventData);

      // Execute event-specific handlers
      await this.handleSpecificEvent(eventName, eventData);

      console.log(`✅ Processed ${eventName} event: TX ${eventData.transactionHash.slice(0, 10)}...`);
    } catch (error) {
      console.error("❌ Error processing log:", error);
      console.error("Log data:", log);
      throw error;
    }
  }

  // Identify event berdasarkan topic0
  identifyEvent(topic0) {
    for (const [eventName, eventInfo] of Object.entries(this.eventSignatures)) {
      if (eventInfo.topic0 === topic0) {
        return eventName;
      }
    }
    return null;
  }

  // Extract data spesifik untuk setiap event
  extractEventData(eventName, decodedEvent) {
    switch (eventName) {
      case "Upgraded":
        return {
          implementation: decodedEvent.args.implementation,
          previousImplementation: null, // Bisa di-enhance untuk track previous implementation
        };

      case "AdminChanged":
        return {
          previousAdmin: decodedEvent.args.previousAdmin,
          newAdmin: decodedEvent.args.newAdmin,
        };

      case "OwnershipTransferred":
        return {
          previousOwner: decodedEvent.args.previousOwner,
          newOwner: decodedEvent.args.newOwner,
        };

      default:
        return {};
    }
  }

  // Handle event-specific logic
  async handleSpecificEvent(eventName, eventData) {
    switch (eventName) {
      case "Upgraded":
        await this.handleUpgradedEvent(eventData);
        break;

      case "AdminChanged":
        await this.handleAdminChangedEvent(eventData);
        break;

      case "OwnershipTransferred":
        await this.handleOwnershipTransferredEvent(eventData);
        break;
    }
  }

  // Handler untuk Upgraded event
  async handleUpgradedEvent(eventData) {
    console.log(`🔄 Contract upgraded to implementation: ${eventData.implementation}`);

    // Additional logic:
    // - Verify new implementation contract
    // - Send notifications
    // - Update tracking systems
    // - Log security audit requirements

    try {
      // Verify new implementation exists
      const implCode = await this.provider.getCode(eventData.implementation);
      if (implCode === "0x") {
        console.warn("⚠️  Warning: New implementation has no code!");
      }

      // You can add more verification logic here
      // e.g., check if implementation follows expected patterns
    } catch (error) {
      console.error("❌ Error verifying new implementation:", error);
    }
  }

  // Handler untuk AdminChanged event
  async handleAdminChangedEvent(eventData) {
    console.log(`👑 Admin changed from ${eventData.previousAdmin} to ${eventData.newAdmin}`);

    // Additional logic:
    // - Security alerts
    // - Access control updates
    // - Notification to stakeholders
  }

  // Handler untuk OwnershipTransferred event
  async handleOwnershipTransferredEvent(eventData) {
    console.log(`🔑 Ownership transferred from ${eventData.previousOwner} to ${eventData.newOwner}`);

    // Additional logic:
    // - Critical security alerts
    // - Governance updates
    // - Multi-sig verification if applicable
  }

  // Database operations
  async saveEventToDatabase(eventData) {
    if (!this.database) {
      console.log("📊 Event data (no database configured):", JSON.stringify(eventData, null, 2));
      return;
    }

    try {
      // Example implementation - adjust based on your database schema
      await this.database.query(
        `
                INSERT INTO proxy_admin_events (
                    event_name, transaction_hash, block_number, block_hash, 
                    log_index, timestamp, contract_address, event_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (transaction_hash, log_index) DO NOTHING
            `,
        [eventData.eventName, eventData.transactionHash, eventData.blockNumber, eventData.blockHash, eventData.logIndex, eventData.timestamp, eventData.contractAddress, JSON.stringify(eventData)]
      );
    } catch (error) {
      console.error("❌ Database save error:", error);
      throw error;
    }
  }

  async getLastProcessedBlock() {
    if (!this.database) return this.startBlock;

    try {
      const result = await this.database.query(
        `
                SELECT MAX(block_number) as last_block 
                FROM proxy_admin_events 
                WHERE contract_address = $1
            `,
        [this.proxyAdminAddress]
      );

      return result.rows[0]?.last_block || this.startBlock;
    } catch (error) {
      console.warn("⚠️  Could not retrieve last processed block:", error.message);
      return this.startBlock;
    }
  }

  async saveLastProcessedBlock(blockNumber) {
    if (!this.database) return;

    try {
      await this.database.query(
        `
                INSERT INTO indexer_state (contract_address, last_processed_block, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (contract_address) 
                DO UPDATE SET last_processed_block = $2, updated_at = NOW()
            `,
        [this.proxyAdminAddress, blockNumber]
      );
    } catch (error) {
      console.warn("⚠️  Could not save last processed block:", error.message);
    }
  }

  // Utility methods
  async retryWithBackoff(operation, attempts = this.retryAttempts) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === attempts - 1) throw error;

        const delay = this.retryDelay * Math.pow(2, i);
        console.log(`🔄 Retry attempt ${i + 1}/${attempts} after ${delay}ms...`);
        await this.delay(delay);
      }
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Graceful shutdown handler
  async shutdown() {
    console.log("🔄 Shutting down indexer gracefully...");
    this.stop();

    // Save current state
    if (this.lastProcessedBlock > this.startBlock) {
      await this.saveLastProcessedBlock(this.lastProcessedBlock);
    }

    console.log("✅ Indexer shutdown complete");
  }
}

// Usage example
async function main() {
  const config = {
    rpcUrl: process.env.RPC_URL || "https://mainnet.infura.io/v3/YOUR_PROJECT_ID",
    proxyAdminAddress: process.env.PROXY_ADMIN_ADDRESS || "0x...",
    startBlock: parseInt(process.env.START_BLOCK) || 0,
    batchSize: 5000,
    retryAttempts: 3,
    retryDelay: 2000,
    database: null, // Ganti dengan database connection Anda
  };

  const indexer = new ProxyAdminIndexer(config);

  try {
    await indexer.initialize();
    await indexer.start();
  } catch (error) {
    console.error("❌ Indexer failed:", error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("🛑 Received SIGINT, shutting down gracefully...");
    await indexer.shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("🛑 Received SIGTERM, shutting down gracefully...");
    await indexer.shutdown();
    process.exit(0);
  });
}

// Database schema example (PostgreSQL)
const DATABASE_SCHEMA = `
-- Events table
CREATE TABLE IF NOT EXISTS proxy_admin_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(50) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    block_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(transaction_hash, log_index)
);

-- Indexer state table
CREATE TABLE IF NOT EXISTS indexer_state (
    contract_address VARCHAR(42) PRIMARY KEY,
    last_processed_block BIGINT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_events_block_number ON proxy_admin_events(block_number);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON proxy_admin_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_contract ON proxy_admin_events(contract_address);
CREATE INDEX IF NOT EXISTS idx_events_name ON proxy_admin_events(event_name);
`;

module.exports = { ProxyAdminIndexer, DATABASE_SCHEMA };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
