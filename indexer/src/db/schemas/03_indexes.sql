-- File: indexer/src/db/schemas/03_indexes.sql
-- Description: Creates indexes for performance optimization.

-- === UNIQUE CONSTRAINTS (using unique indexes for hypertables) ===
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_hash_unique ON blocks (block_hash, block_timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_number_unique ON blocks (block_number, block_timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_hash_unique ON transactions (tx_hash, block_timestamp);

-- === PERFORMANCE INDEXES ===

-- Blocks indexes
CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks (block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_miner ON blocks (miner, block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_gas_used ON blocks (gas_used, block_timestamp DESC);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_block_timestamp ON transactions (block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_block_number ON transactions (block_number, block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_from_address ON transactions (from_address, block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_to_address ON transactions (to_address, block_timestamp DESC) WHERE to_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_value ON transactions (value_wei, block_timestamp DESC) WHERE value_wei > 0;

-- Contracts indexes
CREATE INDEX IF NOT EXISTS idx_contracts_creator_address ON contracts (creator_address);
CREATE INDEX IF NOT EXISTS idx_contracts_block_number ON contracts (block_number);
CREATE INDEX IF NOT EXISTS idx_contracts_implementation_address ON contracts (implementation_address) WHERE implementation_address IS NOT NULL;

-- Token transfers indexes
CREATE INDEX IF NOT EXISTS idx_token_transfers_timestamp ON token_transfers (block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_transfers_contract ON token_transfers (contract_address, block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_transfers_from ON token_transfers (from_address, block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_transfers_to ON token_transfers (to_address, block_timestamp DESC);

-- Tokens indexes
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens (symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON tokens (token_type);

-- Verified contracts indexes
CREATE INDEX IF NOT EXISTS idx_verified_contracts_address ON verified_contracts (address);
CREATE INDEX IF NOT EXISTS idx_verified_contracts_name ON verified_contracts (contract_name);
CREATE INDEX IF NOT EXISTS idx_verified_contracts_verified_at ON verified_contracts (verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_verified_contracts_is_verified ON verified_contracts (is_verified);
CREATE INDEX IF NOT EXISTS idx_verified_contracts_compiler_version ON verified_contracts (compiler_version);

-- Contract source files indexes
CREATE INDEX IF NOT EXISTS idx_contract_source_files_contract_address ON contract_source_files (contract_address);

\echo ''⚡ All performance indexes created successfully.''
