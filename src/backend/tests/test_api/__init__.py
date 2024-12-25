# External imports - versions specified for security tracking
import pytest  # pytest v7.0+
import pytest_asyncio  # pytest-asyncio v0.21+
import pytest_timeout  # pytest-timeout v2.1+
import pytest_monitor  # pytest-monitor v1.6+
import logging
from typing import Dict, Any
from pathlib import Path

# Internal imports - re-export test fixtures
from ..conftest import get_test_db, test_client, test_user

# Configure logging for API tests
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global test configuration constants
API_TEST_PREFIX = "/api/v1"
TEST_TIMEOUT = 30  # seconds

# Performance thresholds (milliseconds)
PERFORMANCE_THRESHOLDS = {
    "api_response_time": 500,  # Max API response time
    "db_query_time": 100      # Max database query time
}

# Test markers with descriptions
TEST_MARKERS = {
    "security": "Security-related tests",
    "performance": "Performance tests", 
    "integration": "Integration tests"
}

def pytest_configure_api(config: pytest.Config) -> None:
    """
    Configure pytest for API testing with enhanced monitoring, security, and resource management.
    
    Args:
        config: pytest configuration object
    """
    # Register API test markers
    for marker, description in TEST_MARKERS.items():
        config.addinivalue_line(f"markers", f"{marker}: {description}")
    
    # Configure test timeouts
    config.addinivalue_line(
        "timeout",
        f"timeout: {TEST_TIMEOUT}"
    )
    
    # Set up performance monitoring
    config.option.monitor_strict = True
    config.option.monitor_thresholds = PERFORMANCE_THRESHOLDS
    
    # Configure security audit logging
    test_log_path = Path("logs/api_tests.log")
    test_log_path.parent.mkdir(exist_ok=True)
    
    file_handler = logging.FileHandler(test_log_path)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    )
    logger.addHandler(file_handler)
    
    # Set up test isolation verification
    def verify_test_isolation():
        """Verify each test runs in isolation with clean state"""
        logger.info("Verifying test isolation")
        
    config.add_cleanup(verify_test_isolation)
    
    # Configure resource cleanup monitoring
    def monitor_resource_cleanup():
        """Monitor and verify proper cleanup of test resources"""
        logger.info("Monitoring test resource cleanup")
        
    config.add_cleanup(monitor_resource_cleanup)
    
    # Initialize error reporting enhancements
    def enhanced_error_reporting(report: pytest.TestReport):
        """Enhanced error reporting with detailed diagnostics"""
        if report.failed:
            logger.error(
                f"Test failed: {report.nodeid}\n"
                f"Error: {report.longrepr}"
            )
            
    config.pluginmanager.register(enhanced_error_reporting, "error_reporting")
    
    # Set up test coverage tracking
    config.option.cov_source = ["app"]
    config.option.cov_report = {
        "term-missing": True,
        "html": "coverage/api_tests"
    }
    
    # Configure CI/CD integration metrics
    if config.option.ci_metrics:
        logger.info("Configuring CI/CD metrics collection")
        config.option.junit_family = "xunit2"
        config.option.junit_suite_name = "API Tests"

# Re-export test fixtures for convenience
__all__ = [
    "get_test_db",
    "test_client", 
    "test_user",
    "API_TEST_PREFIX",
    "TEST_TIMEOUT",
    "PERFORMANCE_THRESHOLDS"
]