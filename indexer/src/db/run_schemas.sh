#!/bin/bash
# File: indexer/src/db/run_schemas.sh
# Description: Executes all SQL schema files in the correct order.

set -e # Exit immediately if a command exits with a non-zero status.

# Get the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Database connection details (replace with your actual details or use environment variables)
export PGPASSWORD=${DB_PASSWORD:-your_password} # Fallback to a default if not set
DB_USER=${DB_USER:-postgres}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_DATABASE:-qrypscan_dev}

# List of schema files in the order they should be executed
SCHEMA_FILES=(
  "schemas/00_cleanup.sql"
  "schemas/01_tables.sql"
  "schemas/02_timescaledb_setup.sql"
  "schemas/03_indexes.sql"
  "schemas/04_functions_and_triggers.sql"
  "schemas/05_views.sql"
  "schemas/06_roles_and_permissions.sql"
)

# Loop through and execute each schema file
echo "🚀 Starting database schema setup for '$DB_NAME'..."

for file in "${SCHEMA_FILES[@]}"; do
  echo "--------------------------------------------------"
  echo "▶️  Executing $file..."
  psql -X -v ON_ERROR_STOP=1 --username "$DB_USER" --host "$DB_HOST" --port "$DB_PORT" --dbname "$DB_NAME" -f "$DIR/$file"
  echo "✅  Finished executing $file."
done

echo "--------------------------------------------------"
echo "🎉 Database schema setup complete!"
