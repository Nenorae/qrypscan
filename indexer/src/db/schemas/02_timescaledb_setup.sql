-- File: indexer/src/db/schemas/02_timescaledb_setup.sql
-- Description: Configures TimescaleDB hypertables and policies.

-- Enable TimescaleDB extension if not already enabled
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- === CREATE HYPERTABLES ===
-- Convert core tables to hypertables for time-series data management
SELECT create_hypertable('blocks', 'block_timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('transactions', 'block_timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('token_transfers', 'block_timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- === COMPRESSION POLICIES ===
-- Configure compression for better storage efficiency
ALTER TABLE blocks SET (timescaledb.compress, timescaledb.compress_segmentby = 'miner', timescaledb.compress_orderby = 'block_timestamp DESC, block_number DESC');
ALTER TABLE transactions SET (timescaledb.compress, timescaledb.compress_segmentby = 'from_address', timescaledb.compress_orderby = 'block_timestamp DESC, transaction_index ASC');
ALTER TABLE token_transfers SET (timescaledb.compress, timescaledb.compress_segmentby = 'contract_address', timescaledb.compress_orderby = 'block_timestamp DESC, log_index ASC');

-- Add policies to automatically compress data older than 7 days
SELECT add_compression_policy('blocks', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('transactions', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('token_transfers', INTERVAL '7 days', if_not_exists => TRUE);

-- === RETENTION POLICIES ===
-- Add policies to automatically drop raw data older than 1 year
SELECT add_retention_policy('blocks', INTERVAL '1 year', if_not_exists => TRUE);
SELECT add_retention_policy('transactions', INTERVAL '1 year', if_not_exists => TRUE);
SELECT add_retention_policy('token_transfers', INTERVAL '1 year', if_not_exists => TRUE);

\echo ''🐘 TimescaleDB hypertables and policies configured successfully.''
