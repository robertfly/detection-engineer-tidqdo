"""
Middleware initialization module that exports all FastAPI middleware components
with comprehensive security controls and monitoring capabilities.

Versions:
- fastapi: 0.104.0+
- prometheus-client: 0.17.1+
- ddtrace: 1.0.0+
"""

from fastapi import FastAPI
from prometheus_client import Counter, Histogram
from typing import List, Dict, Any
import logging

# Internal imports
from .cors import CustomCORSMiddleware
from .error_handling import ErrorHandlingMiddleware
from .rate_limiting import RateLimitMiddleware
from .auth import get_current_user, verify_api_key, RoleChecker
from ..core.config import Settings
from ..core.logging import setup_logging

# Initialize metrics
MIDDLEWARE_METRICS = {
    "requests_total": Counter(
        "middleware_requests_total",
        "Total requests processed by middleware",
        ["middleware", "status"]
    ),
    "request_duration_seconds": Histogram(
        "middleware_request_duration_seconds",
        "Request duration in seconds",
        ["middleware"]
    ),
    "errors_total": Counter(
        "middleware_errors_total",
        "Total middleware errors",
        ["middleware", "error_type"]
    )
}

# Export middleware components
__all__ = [
    "CustomCORSMiddleware",
    "ErrorHandlingMiddleware",
    "RateLimitMiddleware",
    "get_current_user",
    "verify_api_key",
    "RoleChecker",
    "get_middleware_stack"
]

def get_middleware_stack(app: FastAPI, settings: Settings) -> List[Dict[str, Any]]:
    """
    Creates and returns ordered list of middleware for the FastAPI application
    with comprehensive error handling, logging, and monitoring.

    Args:
        app: FastAPI application instance
        settings: Application settings

    Returns:
        List[Dict[str, Any]]: Ordered list of configured middleware instances
    """
    # Initialize logging with security context
    setup_logging()
    logger = logging.getLogger(__name__)
    logger.info("Initializing middleware stack")

    try:
        # Create middleware stack with security-optimized order
        middleware_stack = [
            # Error handling should be first to catch all exceptions
            {
                "middleware_class": ErrorHandlingMiddleware,
                "kwargs": {
                    "app": app,
                    "error_handlers": {
                        "default": lambda e: logger.error(f"Unhandled error: {str(e)}")
                    }
                }
            },
            # CORS protection
            {
                "middleware_class": CustomCORSMiddleware,
                "kwargs": {
                    "app": app,
                    "allowed_origins": settings.BACKEND_CORS_ORIGINS,
                    "allow_credentials": True,
                    "allowed_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                    "allowed_headers": [
                        "Authorization", 
                        "Content-Type",
                        "X-API-Key",
                        "X-Request-ID"
                    ]
                }
            },
            # Rate limiting
            {
                "middleware_class": RateLimitMiddleware,
                "kwargs": {
                    "app": app,
                    "rate_limit": settings.API_RATE_LIMIT,
                    "endpoint_limits": {
                        # Endpoint-specific rate limits
                        "/api/v1/auth/login": 5,  # 5 requests per minute
                        "/api/v1/auth/register": 3,  # 3 requests per minute
                        "/api/v1/detections": 1000,  # 1000 requests per minute
                        "/api/v1/intelligence": 100  # 100 requests per minute
                    }
                }
            }
        ]

        # Register middleware in reverse order (last registered = first executed)
        for middleware in reversed(middleware_stack):
            app.add_middleware(
                middleware["middleware_class"],
                **middleware["kwargs"]
            )

        # Log successful middleware initialization
        logger.info(
            "Middleware stack initialized successfully",
            extra={
                "middleware_count": len(middleware_stack),
                "environment": settings.ENVIRONMENT
            }
        )

        return middleware_stack

    except Exception as e:
        logger.error(
            "Failed to initialize middleware stack",
            extra={
                "error": str(e),
                "environment": settings.ENVIRONMENT
            }
        )
        raise RuntimeError("Middleware initialization failed") from e

def get_middleware_metrics() -> Dict[str, Any]:
    """
    Get current middleware performance metrics.

    Returns:
        Dict[str, Any]: Dictionary of middleware metrics
    """
    return {
        "requests": {
            metric.name: metric._value.get() 
            for metric in MIDDLEWARE_METRICS["requests_total"]._metrics.values()
        },
        "durations": {
            metric.name: metric._sum.get()
            for metric in MIDDLEWARE_METRICS["request_duration_seconds"]._metrics.values()
        },
        "errors": {
            metric.name: metric._value.get()
            for metric in MIDDLEWARE_METRICS["errors_total"]._metrics.values()
        }
    }