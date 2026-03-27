#!/bin/bash
# ============================================================
# setup.sh — Create and initialize the SAS Edu AI database
# on a local PostgreSQL server (DGX or any Linux server)
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# Or with custom credentials:
#   DB_USER=myuser DB_NAME=mydb DB_PASSWORD=mypass ./setup.sh
# ============================================================

set -e  # exit on any error

# ─── Configuration ──────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-saseduai}"
DB_USER="${DB_USER:-saseduai}"
DB_PASSWORD="${DB_PASSWORD:-changeme}"
PSQL_ADMIN="${PSQL_ADMIN:-postgres}"  # superuser to create the DB and role

echo "======================================================"
echo " SAS Edu AI — Database Setup"
echo "======================================================"
echo " Host     : $DB_HOST:$DB_PORT"
echo " Database : $DB_NAME"
echo " User     : $DB_USER"
echo "======================================================"

# ─── Step 1: Create role and database ────────────────────────
echo ""
echo "[1/4] Creating role and database..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$PSQL_ADMIN" -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
      CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
      RAISE NOTICE 'Role $DB_USER created.';
    ELSE
      RAISE NOTICE 'Role $DB_USER already exists, skipping.';
    END IF;
  END
  \$\$;
"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$PSQL_ADMIN" -c "
  SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')
" -t | psql -h "$DB_HOST" -p "$DB_PORT" -U "$PSQL_ADMIN"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$PSQL_ADMIN" -c "
  GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
"

echo "    ✓ Role and database ready"

# ─── Step 2: Apply extensions ─────────────────────────────────
echo ""
echo "[2/4] Applying extensions..."

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" \
  -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/00_extensions.sql"

echo "    ✓ Extensions installed"

# ─── Step 3: Create tables ────────────────────────────────────
echo ""
echo "[3/4] Creating tables..."

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" \
  -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/01_tables.sql"

echo "    ✓ Tables created"

# ─── Step 4: Create indexes and triggers ─────────────────────
echo ""
echo "[4/4] Creating indexes and triggers..."

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" \
  -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/02_indexes.sql"

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" \
  -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/03_triggers.sql"

echo "    ✓ Indexes and triggers created"

# ─── Done ────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo " Setup complete!"
echo ""
echo " Next steps:"
echo "  1. Update your .env file:"
echo "     DB_HOST=$DB_HOST"
echo "     DB_PORT=$DB_PORT"
echo "     DB_NAME=$DB_NAME"
echo "     DB_USER=$DB_USER"
echo "     DB_PASSWORD=$DB_PASSWORD"
echo ""
echo "  2. Verify tables:"
echo "     psql -U $DB_USER -d $DB_NAME -c '\dt'"
echo "======================================================"
