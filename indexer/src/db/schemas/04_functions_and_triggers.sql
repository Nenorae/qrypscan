-- File: indexer/src/db/schemas/04_functions_and_triggers.sql
-- Description: Defines helper functions and triggers for data integrity.

-- === DATA VALIDATION FUNCTIONS ===
CREATE OR REPLACE FUNCTION validate_ethereum_address(addr TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if address is valid Ethereum format (0x + 40 hex characters)
    RETURN addr ~ '^0x[a-fA-F0-9]{40}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION validate_transaction_integrity()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate addresses
    IF NOT validate_ethereum_address(NEW.from_address) THEN
        RAISE EXCEPTION 'Invalid from_address format: %', NEW.from_address;
    END IF;
    
    IF NEW.to_address IS NOT NULL AND NOT validate_ethereum_address(NEW.to_address) THEN
        RAISE EXCEPTION 'Invalid to_address format: %', NEW.to_address;
    END IF;
    
    -- Validate that block exists
    IF NOT EXISTS (
        SELECT 1 FROM blocks 
        WHERE block_number = NEW.block_number 
        AND block_timestamp = NEW.block_timestamp
    ) THEN
        RAISE EXCEPTION 'Referenced block % at timestamp % does not exist', 
                        NEW.block_number, NEW.block_timestamp;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generic function to update the `updated_at` timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- === TRIGGERS ===

-- Drop existing triggers before creating new ones to avoid errors on re-runs
DROP TRIGGER IF EXISTS trigger_validate_transaction_integrity ON transactions;
DROP TRIGGER IF EXISTS trigger_tokens_updated_at ON tokens;
DROP TRIGGER IF EXISTS trigger_verified_contracts_updated_at ON verified_contracts;

-- Create triggers
CREATE TRIGGER trigger_validate_transaction_integrity
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_transaction_integrity();

CREATE TRIGGER trigger_tokens_updated_at
    BEFORE UPDATE ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_verified_contracts_updated_at
    BEFORE UPDATE ON verified_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

\echo ''🛡️ Functions and triggers for data integrity are set up.''
