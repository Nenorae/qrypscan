-- File: indexer/src/db/schemas/05_views.sql
-- Description: Creates views and materialized views for data analysis and reporting.

-- === CONTINUOUS AGGREGATES (MATERIALIZED VIEWS) ===

-- Daily blockchain statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_blockchain_stats
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 day', block_timestamp) AS day,
    COUNT(*) as total_blocks,
    AVG(gas_used)::BIGINT as avg_gas_used,
    MAX(gas_used) as max_gas_used,
    MIN(gas_used) as min_gas_used,
    SUM(transaction_count)::BIGINT as total_transactions,
    COUNT(DISTINCT miner) as unique_miners,
    AVG(base_fee_per_gas)::BIGINT as avg_base_fee
FROM blocks
GROUP BY 1;

-- Hourly transaction statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_transaction_stats
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', block_timestamp) AS hour,
    COUNT(*) as transaction_count,
    COUNT(DISTINCT from_address) as unique_senders,
    COUNT(DISTINCT to_address) as unique_receivers,
    SUM(value_wei) as total_value_transferred,
    AVG(gas_price)::BIGINT as avg_gas_price,
    AVG(gas_used)::BIGINT as avg_gas_used
FROM transactions
WHERE status = TRUE -- Only successful transactions
GROUP BY 1;

-- === CONTINUOUS AGGREGATE POLICIES ===
SELECT add_continuous_aggregate_policy('daily_blockchain_stats',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('hourly_transaction_stats',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists => TRUE);

-- === STANDARD VIEWS ===

-- Recent blocks view
CREATE OR REPLACE VIEW recent_blocks AS
SELECT 
    block_number,
    block_hash,
    block_timestamp,
    miner,
    transaction_count,
    gas_used,
    gas_limit,
    (gas_used::FLOAT / gas_limit::FLOAT * 100)::NUMERIC(5,2) as gas_utilization_pct
FROM blocks
WHERE block_timestamp >= NOW() - INTERVAL '1 day'
ORDER BY block_timestamp DESC;

-- Top gas consumers view
CREATE OR REPLACE VIEW top_gas_consumers AS
SELECT 
    from_address,
    COUNT(*) as transaction_count,
    SUM(gas_used) as total_gas_used,
    AVG(gas_used)::BIGINT as avg_gas_used,
    SUM(value_wei) as total_value_sent
FROM transactions
WHERE block_timestamp >= NOW() - INTERVAL '7 days'
AND status = TRUE
GROUP BY from_address
ORDER BY total_gas_used DESC
LIMIT 100;

-- Verified contracts view with additional details
CREATE OR REPLACE VIEW verified_contracts_details AS
SELECT 
    vc.id,
    vc.address,
    vc.contract_name,
    vc.compiler_version,
    vc.is_verified,
    vc.verified_at,
    vc.optimization_used,
    vc.runs,
    t.name AS token_name,
    t.symbol AS token_symbol,
    t.token_type,
    t.total_supply,
    t.decimals
FROM verified_contracts vc
LEFT JOIN tokens t ON vc.address = t.contract_address
ORDER BY vc.verified_at DESC;

\echo ''📊 Views and materialized views created successfully.''
