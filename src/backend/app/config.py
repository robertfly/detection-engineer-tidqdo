"""
Main configuration module for the AI Detection Platform.

Provides centralized configuration management with enhanced security features,
monitoring capabilities, and validation. Implements caching and audit logging
for configuration access and changes.

Versions:
- functools: 3.11+
- contextlib: 3.11+
"""

from functools import lru_cache
from contextlib import contextmanager
import logging
from typing import Dict, Optional

# Internal imports
from .core.config import Settings, get_settings
from .constants import PROJECT_NAME, API_V1_PREFIX
from .core.logging import get_logger

# Initialize configuration logger with security context
config_logger = get_logger(
    "config.access",
    context={
        "component": "configuration",
        "security_context": "system"
    }
)

@lru_cache(maxsize=1)
def get_app_settings() -> Settings:
    """
    Get cached application settings instance with validation and audit logging.
    
    Implements secure configuration retrieval with validation checks and 
    access monitoring. Uses LRU cache for performance optimization.
    
    Returns:
        Settings: Validated global settings instance
    
    Raises:
        ValueError: If settings validation fails
        RuntimeError: If settings initialization fails
    """
    try:
        # Attempt to get or create settings instance
        settings = get_settings()
        
        # Validate security-critical settings
        settings.validate_security_settings()
        
        # Log configuration access with security context
        config_logger.info(
            "Application settings accessed",
            extra={
                "action": "settings_access",
                "environment": settings.ENVIRONMENT,
                "validation_status": "success"
            }
        )
        
        return settings
        
    except Exception as e:
        config_logger.error(
            "Failed to initialize application settings",
            extra={
                "error": str(e),
                "action": "settings_init_failed"
            }
        )
        raise RuntimeError(f"Configuration initialization failed: {str(e)}")

@contextmanager
def update_app_settings(new_settings: Dict) -> bool:
    """
    Update application settings with validation and audit logging.
    
    Implements secure configuration updates with validation, backup,
    and monitoring. Uses context manager for atomic updates.
    
    Args:
        new_settings: Dictionary containing new setting values
        
    Returns:
        bool: Success status of update operation
        
    Raises:
        ValueError: If new settings validation fails
        RuntimeError: If settings update fails
    """
    settings = get_app_settings()
    backup_settings = {}
    
    try:
        # Create backup of current settings
        for key in new_settings:
            if hasattr(settings, key):
                backup_settings[key] = getattr(settings, key)
        
        # Apply and validate new settings
        for key, value in new_settings.items():
            setattr(settings, key, value)
        settings.validate_security_settings()
        
        # Log configuration change with audit trail
        config_logger.info(
            "Application settings updated",
            extra={
                "action": "settings_update",
                "modified_keys": list(new_settings.keys()),
                "environment": settings.ENVIRONMENT
            }
        )
        
        # Invalidate settings cache to force refresh
        get_app_settings.cache_clear()
        
        yield True
        
    except Exception as e:
        # Restore backup settings on failure
        for key, value in backup_settings.items():
            setattr(settings, key, value)
            
        config_logger.error(
            "Failed to update application settings",
            extra={
                "error": str(e),
                "action": "settings_update_failed",
                "modified_keys": list(new_settings.keys())
            }
        )
        
        yield False
        
        raise RuntimeError(f"Configuration update failed: {str(e)}")

# Initialize global settings instance with validation
settings = get_app_settings()

# Export configuration interface
__all__ = [
    'settings',
    'get_app_settings',
    'update_app_settings'
]