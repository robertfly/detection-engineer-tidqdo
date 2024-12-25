"""
Core module initialization file that exports essential application components.
Implements clean re-export pattern with careful import ordering to prevent circular dependencies.

Versions:
- FastAPI: 0.104.0+
- SQLAlchemy: 2.0+
- Redis: 4.5+
- MongoDB: 3.0+
- Elasticsearch: 8.0+
"""

# Re-export core configuration components
from .config import (  # v1.0+
    settings,
    PROJECT_NAME,
)

# Re-export security components with enhanced JWT and password handling
from .security import (  # v1.0+
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token,
)

# Re-export logging infrastructure with structured logging support
from .logging import (  # v1.0+
    configure_logging,
    get_logger,
)

# Re-export application lifecycle event handlers
from .events import (  # v1.0+
    startup_event_handler,
    shutdown_event_handler,
)

# Initialize module logger
logger = get_logger(__name__)

# Version information
__version__ = "1.0.0"

# Package metadata
__author__ = "AI Detection Platform Team"
__description__ = "Core components for AI-Driven Detection Engineering Platform"

# Define public API
__all__ = [
    # Configuration exports
    "settings",
    "PROJECT_NAME",
    
    # Security exports
    "get_password_hash",
    "verify_password", 
    "create_access_token",
    "create_refresh_token",
    "verify_token",
    
    # Logging exports
    "configure_logging",
    "get_logger",
    
    # Event handler exports
    "startup_event_handler",
    "shutdown_event_handler",
]

# Initialize core logging configuration
try:
    configure_logging()
    logger.info(
        f"Initialized {PROJECT_NAME} core module v{__version__} "
        f"in {settings.ENVIRONMENT} environment"
    )
except Exception as e:
    # Ensure logging initialization failures are captured
    import logging
    logging.critical(f"Failed to initialize core logging: {str(e)}")
    raise

# Verify critical security settings
try:
    settings.validate_security_settings()
    logger.info("Validated security configuration")
except ValueError as e:
    logger.critical(f"Invalid security configuration: {str(e)}")
    raise
except Exception as e:
    logger.critical(f"Unexpected error validating security settings: {str(e)}")
    raise