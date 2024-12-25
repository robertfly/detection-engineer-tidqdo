#!/bin/bash

# test.sh
# Version: 1.0
# Purpose: Execute backend test suites with comprehensive test coverage reporting
# Dependencies:
# - pytest v7.4.0
# - pytest-cov v4.1.0

# Enable strict error handling
set -e

# Function to setup testing environment
setup_environment() {
    echo "Setting up test environment..."
    
    # Set Python path to include current directory
    export PYTHON_PATH=$(pwd)
    export PYTHONPATH=${PYTHONPATH}:${PYTHON_PATH}
    
    # Set testing environment variables
    export TESTING=1
    export TEST_DATABASE_URL="postgresql://test_user:test_pass@localhost:5432/test_db"
    
    # Verify Python environment
    if ! command -v python3 &> /dev/null; then
        echo "Error: Python 3 is required but not found in PATH"
        exit 1
    fi
    
    # Check for required test dependencies
    echo "Verifying test dependencies..."
    if ! python3 -c "import pytest" &> /dev/null; then
        echo "Error: pytest is not installed (required version: 7.4.0)"
        exit 1
    fi
    
    if ! python3 -c "import pytest_cov" &> /dev/null; then
        echo "Error: pytest-cov is not installed (required version: 4.1.0)"
        exit 1
    fi
    
    echo "Environment setup completed successfully"
}

# Function to run test suite with coverage
run_tests() {
    echo "Starting test execution..."
    
    # Create directory for coverage reports if it doesn't exist
    mkdir -p coverage_reports
    
    # Execute pytest with coverage reporting
    pytest -v \
        --cov=app \
        --cov-report=term-missing \
        --cov-report=xml:coverage_reports/coverage.xml \
        --cov-report=html:coverage_reports/html \
        --cov-branch \
        tests/
    
    test_exit_code=$?
    
    # Display test summary
    echo "Test execution completed"
    echo "Coverage reports generated in: coverage_reports/"
    
    # Clean up temporary test files
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
    
    return $test_exit_code
}

# Main execution flow
main() {
    echo "=== Backend Test Suite ==="
    echo "Starting test execution at: $(date)"
    
    # Setup environment
    setup_environment
    
    # Run tests and capture exit code
    run_tests
    test_result=$?
    
    echo "Test suite completed at: $(date)"
    
    # Exit with test result
    exit $test_result
}

# Execute main function
main