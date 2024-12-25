#!/usr/bin/env bash

# AI-Driven Detection Engineering Platform
# Code Quality and Linting Script
# Version: 1.0.0
# Dependencies:
# - isort==5.12.0
# - black==23.9.0
# - flake8==6.1.0
# - mypy==1.5.0
# - bash>=4.0
# - parallel>=20200522

set -euo pipefail

# Global variables
PYTHON_FILES="app tests"
EXIT_CODE=0
COLORS="{
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
}"
PARALLEL_JOBS=$(nproc)
CACHE_DIR="${HOME}/.cache/lint"
START_TIME=$(date +%s)

# Print formatted message with timestamp
log() {
    local level=$1
    local message=$2
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${level}: ${message}"
}

# Check if all required dependencies are installed
check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    local tools=("isort" "black" "flake8" "mypy" "parallel")
    local versions=("5.12.0" "23.9.0" "6.1.0" "1.5.0" "20200522")
    
    for i in "${!tools[@]}"; do
        if ! command -v "${tools[$i]}" &> /dev/null; then
            log "ERROR" "Required tool ${tools[$i]} not found"
            return 3
        fi
        
        if [[ "${tools[$i]}" != "parallel" ]]; then
            version=$(pip freeze | grep -i "^${tools[$i]}==" | cut -d'=' -f3)
            if [[ "$version" != "${versions[$i]}" ]]; then
                log "ERROR" "${tools[$i]} version mismatch. Required: ${versions[$i]}, Found: $version"
                return 3
            fi
        fi
    done
    
    # Check configuration files
    if [[ ! -f "setup.cfg" ]] || [[ ! -f "pyproject.toml" ]]; then
        log "ERROR" "Missing required configuration files"
        return 2
    fi
    
    # Create cache directory if it doesn't exist
    mkdir -p "${CACHE_DIR}"
    
    log "INFO" "All dependencies satisfied"
    return 0
}

# Run isort import sorter
run_isort() {
    log "INFO" "Running isort..."
    
    local cache_file="${CACHE_DIR}/isort.cache"
    local output
    
    if output=$(isort --check-only --diff --jobs "${PARALLEL_JOBS}" ${PYTHON_FILES} 2>&1); then
        echo -e "${COLORS[GREEN]}✓ isort check passed${COLORS[NC]}"
        echo "$output" > "$cache_file"
        return 0
    else
        echo -e "${COLORS[RED]}✗ isort check failed${COLORS[NC]}"
        echo "$output"
        return 1
    fi
}

# Run black code formatter
run_black() {
    log "INFO" "Running black..."
    
    local cache_file="${CACHE_DIR}/black.cache"
    local output
    
    if output=$(black --check --diff --quiet --workers "${PARALLEL_JOBS}" ${PYTHON_FILES} 2>&1); then
        echo -e "${COLORS[GREEN]}✓ black check passed${COLORS[NC]}"
        echo "$output" > "$cache_file"
        return 0
    else
        echo -e "${COLORS[RED]}✗ black check failed${COLORS[NC]}"
        echo "$output"
        return 1
    fi
}

# Run flake8 linter
run_flake8() {
    log "INFO" "Running flake8..."
    
    local output
    
    if output=$(flake8 --jobs "${PARALLEL_JOBS}" --config=setup.cfg ${PYTHON_FILES} 2>&1); then
        echo -e "${COLORS[GREEN]}✓ flake8 check passed${COLORS[NC]}"
        return 0
    else
        echo -e "${COLORS[RED]}✗ flake8 check failed${COLORS[NC]}"
        echo "$output"
        return 1
    fi
}

# Run mypy type checker
run_mypy() {
    log "INFO" "Running mypy..."
    
    local cache_file="${CACHE_DIR}/mypy.cache"
    local output
    
    if output=$(mypy --cache-dir "${CACHE_DIR}/mypy" --config-file setup.cfg ${PYTHON_FILES} 2>&1); then
        echo -e "${COLORS[GREEN]}✓ mypy check passed${COLORS[NC]}"
        echo "$output" > "$cache_file"
        return 0
    else
        echo -e "${COLORS[RED]}✗ mypy check failed${COLORS[NC]}"
        echo "$output"
        return 1
    fi
}

# Print execution summary
print_summary() {
    local final_exit_code=$1
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    
    echo -e "\n=== Lint Summary ==="
    echo -e "Duration: ${duration} seconds"
    
    if [[ $final_exit_code -eq 0 ]]; then
        echo -e "${COLORS[GREEN]}All checks passed successfully${COLORS[NC]}"
    else
        echo -e "${COLORS[RED]}One or more checks failed${COLORS[NC]}"
    fi
    
    # Display cache statistics
    echo -e "\nCache Statistics:"
    echo "Location: ${CACHE_DIR}"
    echo "Size: $(du -sh "${CACHE_DIR}" 2>/dev/null | cut -f1)"
}

# Main execution function
main() {
    local exit_code=0
    
    # Check dependencies first
    if ! check_dependencies; then
        log "ERROR" "Dependency check failed"
        exit 3
    fi
    
    # Run all checks in sequence, but each tool uses parallel workers
    run_isort || exit_code=$?
    run_black || exit_code=$?
    run_flake8 || exit_code=$?
    run_mypy || exit_code=$?
    
    # Print summary
    print_summary "$exit_code"
    
    # Cleanup old cache files (older than 24h)
    find "${CACHE_DIR}" -type f -mtime +1 -delete 2>/dev/null || true
    
    return "$exit_code"
}

# Execute main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    trap 'log "ERROR" "Script interrupted"; exit 1' INT TERM
    main "$@"
fi