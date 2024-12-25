"""
Main services module that exports core service classes and functions for the AI-Driven Detection Engineering platform.
Provides centralized access to authentication, detection, intelligence, and other service components.

Versions:
- fastapi: 0.104+
- sqlalchemy: 2.0+
- redis: 4.5+
"""

# External imports - versions specified for security tracking
from typing import Dict, Any

# Internal imports
from .auth import AuthService
from .detection import DetectionService
from .intelligence import IntelligenceService

# Export version information
VERSION = "1.0.0"

# Default service configuration
DEFAULT_CONFIG = {
    'timeout': 120,  # Default operation timeout in seconds
    'max_retries': 3,  # Maximum retry attempts for operations
    'batch_size': 100,  # Default batch processing size
    'cache_ttl': 3600,  # Default cache TTL in seconds
    'processing_threads': 4,  # Default number of processing threads
    'validation_timeout': 30  # Default validation timeout in seconds
}

# Export core service classes
__all__ = [
    'AuthService',
    'DetectionService',
    'IntelligenceService',
    'VERSION',
    'DEFAULT_CONFIG'
]

# Service initialization state tracking
_initialized_services: Dict[str, Any] = {}

def get_service_status() -> Dict[str, bool]:
    """
    Get initialization status of core services.
    
    Returns:
        Dict[str, bool]: Service initialization status mapping
    """
    return {
        'auth': 'auth' in _initialized_services,
        'detection': 'detection' in _initialized_services,
        'intelligence': 'intelligence' in _initialized_services
    }

def register_service(service_name: str, service_instance: Any) -> None:
    """
    Register an initialized service instance.
    
    Args:
        service_name: Name of the service
        service_instance: Initialized service instance
    """
    _initialized_services[service_name] = service_instance

def get_service(service_name: str) -> Any:
    """
    Get an initialized service instance.
    
    Args:
        service_name: Name of the service to retrieve
        
    Returns:
        Any: Initialized service instance
        
    Raises:
        KeyError: If service is not initialized
    """
    if service_name not in _initialized_services:
        raise KeyError(f"Service {service_name} is not initialized")
    return _initialized_services[service_name]

def cleanup_services() -> None:
    """Clean up and release resources for all initialized services."""
    for service in _initialized_services.values():
        if hasattr(service, 'cleanup'):
            service.cleanup()
    _initialized_services.clear()