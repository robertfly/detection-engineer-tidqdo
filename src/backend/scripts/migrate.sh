#!/bin/bash

# migrate.sh - Database Migration Script for AI-Driven Detection Engineering Platform
# Version: 1.0.0
# Dependencies:
# - alembic >= 1.12
# - postgresql-client >= 15

# Enable strict error handling
set -euo pipefail
trap 'handle_error "An unexpected error occurred" $?' ERR

# Global variables
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
LOG_DIR="$PROJECT_ROOT/logs/migrations"
BACKUP_DIR="$PROJECT_ROOT/backups/db"
MAX_RETRIES=3
TIMEOUT=300

# Color codes for output formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

setup_logging() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local log_file="$LOG_DIR/migration_${timestamp}.log"
    
    # Create log directory if it doesn't exist
    mkdir -p "$LOG_DIR"
    
    # Initialize log file with header
    cat << EOF > "$log_file"
==========================================================
Database Migration Log - $(date)
Environment: ${ENVIRONMENT:-production}
User: $(whoami)
==========================================================
EOF
    
    # Set up log rotation (keep last 30 days)
    find "$LOG_DIR" -name "migration_*.log" -mtime +30 -delete
    
    # Verify log file permissions
    chmod 640 "$log_file"
    
    # Export log file path for other functions
    export MIGRATION_LOG="$log_file"
    
    echo "Logging initialized at $log_file"
    return 0
}

check_environment() {
    local error_count=0
    
    # Log environment check start
    echo "Starting environment validation..." | tee -a "$MIGRATION_LOG"
    
    # Check Python version
    if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import sys; assert sys.version_info >= (3, 11)" >/dev/null 2>&1; then
        echo -e "${RED}Error: Python 3.11 or higher is required${NC}" | tee -a "$MIGRATION_LOG"
        ((error_count++))
    fi
    
    # Verify Alembic installation
    if ! command -v alembic >/dev/null 2>&1; then
        echo -e "${RED}Error: Alembic is not installed${NC}" | tee -a "$MIGRATION_LOG"
        ((error_count++))
    fi
    
    # Check DATABASE_URL
    if [ -z "${DATABASE_URL:-}" ]; then
        echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}" | tee -a "$MIGRATION_LOG"
        ((error_count++))
    fi
    
    # Verify database connection
    if ! timeout $TIMEOUT psql "$DATABASE_URL" -c '\q' >/dev/null 2>&1; then
        echo -e "${RED}Error: Unable to connect to database${NC}" | tee -a "$MIGRATION_LOG"
        ((error_count++))
    fi
    
    # Check alembic.ini
    if [ ! -f "$PROJECT_ROOT/alembic.ini" ]; then
        echo -e "${RED}Error: alembic.ini not found${NC}" | tee -a "$MIGRATION_LOG"
        ((error_count++))
    fi
    
    # Verify backup directory
    mkdir -p "$BACKUP_DIR"
    if [ ! -w "$BACKUP_DIR" ]; then
        echo -e "${RED}Error: Backup directory is not writable${NC}" | tee -a "$MIGRATION_LOG"
        ((error_count++))
    fi
    
    # Export PYTHONPATH if not set
    export PYTHONPATH="${PYTHONPATH:-$PROJECT_ROOT}"
    
    if [ $error_count -eq 0 ]; then
        echo -e "${GREEN}Environment validation successful${NC}" | tee -a "$MIGRATION_LOG"
        return 0
    else
        echo -e "${RED}Environment validation failed with $error_count errors${NC}" | tee -a "$MIGRATION_LOG"
        return 1
    fi
}

create_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/pre_migration_${timestamp}.sql.gz"
    
    echo "Creating database backup..." | tee -a "$MIGRATION_LOG"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Execute backup with compression
    if ! pg_dump "$DATABASE_URL" | gzip > "$backup_file"; then
        echo -e "${RED}Error: Database backup failed${NC}" | tee -a "$MIGRATION_LOG"
        return 1
    fi
    
    # Verify backup file
    if [ ! -s "$backup_file" ]; then
        echo -e "${RED}Error: Backup file is empty${NC}" | tee -a "$MIGRATION_LOG"
        return 1
    fi
    
    # Log backup details
    echo -e "${GREEN}Backup created successfully: $backup_file${NC}" | tee -a "$MIGRATION_LOG"
    
    # Clean up old backups (keep last 7 days)
    find "$BACKUP_DIR" -name "pre_migration_*.sql.gz" -mtime +7 -delete
    
    return 0
}

run_migrations() {
    local retry_count=0
    local start_time=$(date +%s)
    
    echo "Starting database migrations..." | tee -a "$MIGRATION_LOG"
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if timeout $TIMEOUT alembic upgrade head 2>&1 | tee -a "$MIGRATION_LOG"; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            
            echo -e "${GREEN}Migrations completed successfully in $duration seconds${NC}" | tee -a "$MIGRATION_LOG"
            return 0
        else
            ((retry_count++))
            echo -e "${YELLOW}Migration attempt $retry_count failed, retrying...${NC}" | tee -a "$MIGRATION_LOG"
            sleep 5
        fi
    done
    
    echo -e "${RED}Migration failed after $MAX_RETRIES attempts${NC}" | tee -a "$MIGRATION_LOG"
    return 1
}

handle_error() {
    local error_message="$1"
    local error_code="${2:-1}"
    
    echo -e "${RED}Error: $error_message (Code: $error_code)${NC}" | tee -a "$MIGRATION_LOG"
    
    # Log stack trace
    if [ "${BASH_VERSION:-}" != "" ]; then
        local frame=0
        while caller $frame; do
            ((frame++))
        done | tee -a "$MIGRATION_LOG"
    fi
    
    # Attempt rollback if possible
    if [ -n "${MIGRATION_LOG:-}" ]; then
        echo "Attempting rollback..." | tee -a "$MIGRATION_LOG"
        if alembic downgrade -1 2>&1 | tee -a "$MIGRATION_LOG"; then
            echo -e "${YELLOW}Rollback successful${NC}" | tee -a "$MIGRATION_LOG"
        else
            echo -e "${RED}Rollback failed${NC}" | tee -a "$MIGRATION_LOG"
        fi
    fi
    
    exit $error_code
}

# Main execution
main() {
    echo "Starting database migration process..."
    
    # Initialize logging
    setup_logging || exit 1
    
    # Validate environment
    check_environment || exit 1
    
    # Create backup
    create_backup || exit 1
    
    # Run migrations
    run_migrations || exit 1
    
    echo -e "${GREEN}Migration process completed successfully${NC}" | tee -a "$MIGRATION_LOG"
    exit 0
}

# Execute main function
main