#!/usr/bin/env bash

# AI-Driven Detection Engineering Platform
# Database Initialization and Seeding Script
# Version: 1.0.0
# Requires: Python 3.11+, PostgreSQL 15+

# Exit on error, undefined variables, and pipe failures
set -euo pipefail
trap 'echo "Error on line $LINENO"' ERR

# Script directory and project root setup
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")
PROJECT_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/seed_$(date +%Y%m%d_%H%M%S).log"

# Required environment variables
REQUIRED_ENV_VARS=(
    "DATABASE_URL"
    "DATABASE_PASSWORD"
    "ENCRYPTION_KEY"
    "ADMIN_EMAIL"
)

# Minimum Python version required
MIN_PYTHON_VERSION="3.11"

# Function to log messages with timestamps
log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

# Function to check Python version
check_python_version() {
    log "INFO" "Checking Python version..."
    
    if ! command -v python3 &> /dev/null; then
        log "ERROR" "Python 3 is not installed"
        return 1
    }
    
    local version
    version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    
    if ! awk -v ver="$version" -v min="$MIN_PYTHON_VERSION" 'BEGIN{exit(ver<min)}'; then
        log "ERROR" "Python version $version is less than required version $MIN_PYTHON_VERSION"
        return 1
    }
    
    log "INFO" "Python version check passed: $version"
    return 0
}

# Function to set up and validate environment
setup_environment() {
    log "INFO" "Setting up environment..."
    
    # Create logs directory if it doesn't exist
    mkdir -p "$LOG_DIR"
    chmod 750 "$LOG_DIR"
    
    # Check for virtual environment
    if [[ -d "$PROJECT_ROOT/venv" ]]; then
        source "$PROJECT_ROOT/venv/bin/activate"
        log "INFO" "Activated virtual environment"
    fi
    
    # Verify required environment variables
    local missing_vars=()
    for var in "${REQUIRED_ENV_VARS[@]}"; do
        if [[ -z "${!var-}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log "ERROR" "Missing required environment variables: ${missing_vars[*]}"
        return 1
    }
    
    # Verify database connection
    if ! psql "$DATABASE_URL" -c '\q' &> /dev/null; then
        log "ERROR" "Unable to connect to database"
        return 1
    }
    
    log "INFO" "Environment setup completed"
    return 0
}

# Function to verify security settings
verify_security() {
    log "INFO" "Verifying security configuration..."
    
    # Check file permissions
    if [[ "$(stat -c %a "$LOG_DIR")" != "750" ]]; then
        log "ERROR" "Incorrect permissions on log directory"
        return 1
    }
    
    # Verify SSL configuration
    if ! python3 -c "from app.core.config import settings; settings.validate_security_settings()" &> /dev/null; then
        log "ERROR" "Security settings validation failed"
        return 1
    }
    
    # Check encryption configuration
    if [[ -z "${ENCRYPTION_KEY-}" ]]; then
        log "ERROR" "Encryption key not configured"
        return 1
    }
    
    log "INFO" "Security verification passed"
    return 0
}

# Function to run database initialization and seeding
run_database_seed() {
    log "INFO" "Starting database initialization and seeding..."
    
    # Initialize database schema
    if ! python3 -c "from app.db.init_db import init_db; init_db()"; then
        log "ERROR" "Database initialization failed"
        return 1
    fi
    
    # Seed initial data
    if ! python3 -c "from app.db.init_db import seed_db; from app.db.session import SessionLocal; seed_db(SessionLocal())"; then
        log "ERROR" "Database seeding failed"
        return 1
    }
    
    log "INFO" "Database initialization and seeding completed successfully"
    return 0
}

# Function to perform cleanup
cleanup() {
    log "INFO" "Performing cleanup..."
    
    # Compress logs older than 7 days
    find "$LOG_DIR" -name "seed_*.log" -type f -mtime +7 -exec gzip {} \;
    
    # Clear sensitive environment variables
    for var in "${REQUIRED_ENV_VARS[@]}"; do
        unset "$var"
    done
    
    # Deactivate virtual environment if active
    if [[ -n "${VIRTUAL_ENV-}" ]]; then
        deactivate
    fi
    
    log "INFO" "Cleanup completed"
    return 0
}

# Main execution
main() {
    log "INFO" "Starting database seed script"
    
    # Run initialization steps
    check_python_version || exit 1
    setup_environment || exit 1
    verify_security || exit 1
    
    # Run database operations
    run_database_seed || exit 1
    
    # Perform cleanup
    cleanup || exit 1
    
    log "INFO" "Database seed script completed successfully"
    return 0
}

# Execute main function
main

```

This script implements a secure and robust database seeding process with the following features:

1. Strict error handling with `set -euo pipefail` and error trapping
2. Comprehensive logging with timestamps and levels
3. Python version verification (3.11+ required)
4. Environment validation including required variables
5. Security checks including file permissions and encryption settings
6. Database connection verification
7. Proper virtual environment handling
8. Secure cleanup of sensitive data
9. Log rotation and compression
10. Clear status reporting and error messages

The script follows the technical specifications and integrates with the provided database initialization and seeding functions from the imported files. It implements proper security measures as specified in the security considerations section and maintains proper error handling throughout the process.

The script is designed to be run as part of the deployment process and can be executed with:
```bash
./seed.sh