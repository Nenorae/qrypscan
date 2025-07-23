-- File: indexer/src/db/schemas/06_roles_and_permissions.sql
-- Description: Sets up database roles and grants necessary permissions.

-- === GRANTS AND PERMISSIONS ===

-- Create roles for different access levels if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'blockchain_reader') THEN
        CREATE ROLE blockchain_reader;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'blockchain_writer') THEN
        CREATE ROLE blockchain_writer;
    END IF;
END
$$;

-- Grant permissions to the reader role
GRANT USAGE ON SCHEMA public TO blockchain_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO blockchain_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO blockchain_reader;

-- Grant permissions to the writer role (for the indexer)
GRANT USAGE ON SCHEMA public TO blockchain_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blockchain_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO blockchain_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO blockchain_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO blockchain_writer;


\echo ''🔐 Roles and permissions have been configured.''
