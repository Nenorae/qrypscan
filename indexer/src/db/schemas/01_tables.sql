-- File: indexer/src/db/schemas/01_tables.sql
-- Description: Defines the core database schema for QrypScan, compatible with TimescaleDB.

BEGIN;

-- === Core Blockchain Data ===

-- Blocks Table: Stores information about each block in the chain.
-- The PRIMARY KEY and UNIQUE constraints include the partitioning key `block_timestamp` as required by TimescaleDB.
CREATE TABLE IF NOT EXISTS blocks (
    block_number BIGINT NOT NULL,
    block_hash TEXT NOT NULL,
    parent_hash TEXT NOT NULL,
    miner TEXT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    transaction_count INT NOT NULL,
    gas_used NUMERIC(30, 0) NOT NULL,
    gas_limit NUMERIC(30, 0) NOT NULL,
    base_fee_per_gas NUMERIC(30, 0),
    extra_data TEXT,
    size_bytes INT,
    difficulty NUMERIC(30, 0),
    total_difficulty NUMERIC(50, 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (block_number, block_timestamp),
    UNIQUE (block_hash, block_timestamp)
);

-- Transactions Table: Stores every transaction processed on the chain.
-- The PRIMARY KEY and UNIQUE constraints include the partitioning key `block_timestamp`.
-- The FOREIGN KEY to `blocks` is removed due to TimescaleDB limitations.
CREATE TABLE IF NOT EXISTS transactions (
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    transaction_index INT NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT, -- Can be null for contract creation
    value_wei NUMERIC(78, 0) NOT NULL,
    gas_price NUMERIC(78, 0) NOT NULL,
    gas_limit NUMERIC(30, 0) NOT NULL,
    gas_used NUMERIC(30, 0),
    input_data TEXT,
    nonce INT,
    transaction_type INT,
    max_fee_per_gas NUMERIC(30, 0),
    max_priority_fee_per_gas NUMERIC(30, 0),
    status BOOLEAN, -- True for success, False for failure
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tx_hash, block_timestamp),
    UNIQUE(block_number, transaction_index, block_timestamp)
);

-- Event Logs Table: Stores raw event logs for generic querying (e.g., eth_getLogs).
CREATE TABLE IF NOT EXISTS event_logs (
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    log_index INT NOT NULL,
    address TEXT NOT NULL,
    topics TEXT[] NOT NULL, -- Array of topics, e.g., {topic0, topic1, ...}
    data TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tx_hash, log_index, block_timestamp)
);

-- === Contract & Verification Data ===

-- Contracts Table: A central registry for all contract addresses found.
-- This table is NOT a hypertable.
CREATE TABLE IF NOT EXISTS contracts (
    address TEXT PRIMARY KEY,
    creator_address TEXT NOT NULL,
    creation_tx_hash TEXT UNIQUE NOT NULL, -- FK to transactions is removed due to TimescaleDB constraints.
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ,
    is_proxy BOOLEAN DEFAULT FALSE,
    proxy_type TEXT, -- e.g., 'EIP-1967', 'EIP-1167', 'Beacon'
    implementation_address TEXT,
    admin_address TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Verified Contracts Table: Stores verification details for contracts.
CREATE TABLE IF NOT EXISTS verified_contracts (
    id SERIAL PRIMARY KEY,
    address TEXT UNIQUE NOT NULL,
    contract_name TEXT NOT NULL,
    compiler_version TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    abi jsonb,
    optimization_used BOOLEAN,
    runs INT,
    constructor_arguments TEXT,
    evm_version TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Contract Source Files Table: Stores individual source code files for verified contracts.
CREATE TABLE IF NOT EXISTS contract_source_files (
    id SERIAL PRIMARY KEY,
    contract_address TEXT NOT NULL REFERENCES verified_contracts(address) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    source_code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contract_address, file_path)
);

-- === Token Data ===

-- Tokens Table: Stores information about ERC20/ERC721 tokens.
CREATE TABLE IF NOT EXISTS tokens (
    contract_address TEXT PRIMARY KEY,
    token_type TEXT NOT NULL, -- e.g., 'ERC20', 'ERC721'
    name TEXT,
    symbol TEXT,
    decimals INT,
    total_supply NUMERIC(78, 0),
    is_verified BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Token Transfers Table: Logs all token movement events.
-- This table is optimized for all token standards (ERC20, ERC721, ERC1155).
CREATE TABLE IF NOT EXISTS token_transfers (
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    log_index INT NOT NULL,
    contract_address TEXT NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    -- For ERC20/ERC1155, this is the amount of tokens. For ERC721, this can be NULL.
    value NUMERIC(78, 0),
    -- For ERC721/ERC1155, this is the ID of the token. For ERC20, this is NULL.
    token_id NUMERIC(78, 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tx_hash, log_index, block_timestamp)
);

-- === Proxy Tracking Data ===

-- Proxy Upgrades Table: Logs every implementation upgrade event for any proxy type.
CREATE TABLE IF NOT EXISTS proxy_upgrades (
    id SERIAL PRIMARY KEY,
    proxy_address TEXT NOT NULL,
    implementation_address TEXT NOT NULL,
    proxy_type TEXT NOT NULL, -- e.g., 'Upgradeable', 'Beacon'
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proxy_address, tx_hash, implementation_address)
);

-- Diamond Facets Table: Stores facet changes for Diamond proxies (EIP-2535).
CREATE TABLE IF NOT EXISTS diamond_facets (
    id SERIAL PRIMARY KEY,
    proxy_address TEXT NOT NULL,
    facet_address TEXT NOT NULL,
    action INT NOT NULL, -- 0: Add, 1: Replace, 2: Remove
    function_selectors TEXT[] NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Beacon Proxies Table: Tracks the beacon contract for beacon proxies.
CREATE TABLE IF NOT EXISTS beacon_proxies (
    proxy_address TEXT PRIMARY KEY,
    beacon_address TEXT NOT NULL,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

\echo '✅ Core tables and proxy tracking tables created successfully.'

COMMIT;
