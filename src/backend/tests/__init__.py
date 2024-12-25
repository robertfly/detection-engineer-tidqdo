"""
Test package initialization module for AI-Driven Detection Engineering Platform.
Configures test environment, database management, and logging for the backend test suite.

Versions:
- pytest: 7.0+
- python: 3.11+
- logging: 3.11+
"""

import os
import pytest
import logging
from typing import Generator

from ..app.core.config import Settings
from ..app.core.logging import get_logger

# Global test configuration constants
TEST_MODE = True
TEST_ENV = "testing"
TEST_DATABASE_URL = "sqlite:///./test.db"
TEST_LOG_LEVEL = "DEBUG"

# Initialize test logger
test_logger = get_logger(__name__, {"environment": TEST_ENV})

@pytest.fixture(scope="session", autouse=True)
def setup_test_environment() -> None:
    """
    Configure test environment with comprehensive setup including database,
    logging, and mock services. Automatically runs at the start of test session.
    
    Sets up:
    - Test environment variables
    - Database configuration with isolation
    - Debug logging
    - Mock services
    - Test data cleanup handlers
    """
    test_logger.info("Initializing test environment")
    
    try:
        # Set test environment variables
        os.environ["ENVIRONMENT"] = TEST_ENV
        os.environ["TEST_MODE"] = str(TEST_MODE)
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        os.environ["LOG_LEVEL"] = TEST_LOG_LEVEL
        
        # Initialize test settings
        test_settings = Settings(
            ENVIRONMENT=TEST_ENV,
            POSTGRES_DB="test_db",
            POSTGRES_USER="test_user",
            POSTGRES_PASSWORD="test_password",
            REDIS_HOST="localhost",
            MONGODB_URL="mongodb://localhost:27017/test_db"
        )
        
        # Configure test logging
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler('logs/test.log')
            ]
        )
        
        # Setup database isolation
        os.environ["POSTGRES_DB"] = test_settings.POSTGRES_DB
        os.environ["POSTGRES_USER"] = test_settings.POSTGRES_USER
        os.environ["POSTGRES_PASSWORD"] = test_settings.POSTGRES_PASSWORD.get_secret_value()
        
        # Enable debug mode
        os.environ["DEBUG"] = "True"
        
        test_logger.info("Test environment initialized successfully")
        
    except Exception as e:
        test_logger.error(f"Failed to initialize test environment: {str(e)}")
        raise

@pytest.fixture(scope="session", autouse=True)
def cleanup_test_environment() -> Generator[None, None, None]:
    """
    Cleanup fixture that runs after all tests complete.
    Handles cleanup of test database, temporary files, and environment variables.
    
    Yields:
        None
    """
    # Setup phase - yield control to test execution
    yield
    
    test_logger.info("Starting test environment cleanup")
    
    try:
        # Clean up test database
        if os.path.exists("test.db"):
            os.remove("test.db")
            test_logger.info("Removed test database file")
            
        # Clean up test log file
        if os.path.exists("logs/test.log"):
            os.remove("logs/test.log")
            test_logger.info("Removed test log file")
            
        # Reset environment variables
        test_env_vars = [
            "ENVIRONMENT",
            "TEST_MODE",
            "DATABASE_URL",
            "LOG_LEVEL",
            "POSTGRES_DB",
            "POSTGRES_USER",
            "POSTGRES_PASSWORD",
            "DEBUG"
        ]
        
        for var in test_env_vars:
            if var in os.environ:
                del os.environ[var]
                
        test_logger.info("Reset environment variables")
        
        # Close logging handlers
        for handler in logging.root.handlers[:]:
            handler.close()
            logging.root.removeHandler(handler)
            
        test_logger.info("Closed logging handlers")
        
    except Exception as e:
        test_logger.error(f"Error during test environment cleanup: {str(e)}")
        raise
    
    test_logger.info("Test environment cleanup completed")

# Export test environment configuration
__all__ = [
    "TEST_MODE",
    "TEST_ENV",
    "TEST_DATABASE_URL",
    "setup_test_environment",
    "cleanup_test_environment"
]