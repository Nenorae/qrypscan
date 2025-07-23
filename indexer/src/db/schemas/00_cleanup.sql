-- File: indexer/src/db/schemas/00_cleanup.sql
-- Description: Drops all database objects to ensure a clean setup.

-- Drop dependent objects first
DROP MATERIALIZED VIEW IF EXISTS daily_blockchain_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS hourly_transaction_stats CASCADE;
DROP VIEW IF EXISTS recent_blocks CASCADE;
DROP VIEW IF EXISTS top_gas_consumers CASCADE;
DROP VIEW IF EXISTS verified_contracts_details CASCADE;

-- Drop tables
DROP TABLE IF EXISTS token_transfers CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS blocks CASCADE;
DROP TABLE IF EXISTS contract_source_files CASCADE;
DROP TABLE IF EXISTS verified_contracts CASCADE;

-- Drop functions and roles if they exist
DROP FUNCTION IF EXISTS validate_ethereum_address(TEXT);
DROP FUNCTION IF EXISTS validate_transaction_integrity();
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP ROLE IF EXISTS blockchain_reader;
DROP ROLE IF EXISTS blockchain_writer;

\echo ''🧹 All existing QrypScan objects dropped successfully.''
