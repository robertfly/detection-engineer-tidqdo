"""
FastAPI v1 API router initialization module that combines all endpoint routers,
configures the v1 API prefix, implements comprehensive security controls,
standardized response formats, and advanced monitoring capabilities.

Versions:
- fastapi: 0.104+
- prometheus_client: 0.17+
- structlog: 23.1+
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Histogram
import structlog
import time
from typing import Callable

# Internal imports
from .endpoints import auth, detections, intelligence
from ...core.security import RateLimiter
from ...core.config import settings
from ...core.logging import get_logger

# Initialize logger
logger = get_logger(__name__, {"service": "api_router"})

# Initialize router with prefix and tags
router = APIRouter(prefix="/api/v1", tags=["v1"])

# Rate limiting configuration from specification
RATE_LIMIT_CONFIG = {
    "default": "1000/hour",
    "auth": "100/minute", 
    "intelligence": "50/minute"
}

# Prometheus metrics
METRICS = {
    'request_duration': Histogram(
        'api_request_duration_seconds',
        'Request duration in seconds',
        ['method', 'endpoint', 'status']
    ),
    'requests_total': Counter(
        'api_requests_total',
        'Total number of API requests',
        ['method', 'endpoint']
    ),
    'errors_total': Counter(
        'api_errors_total',
        'Total number of API errors',
        ['method', 'endpoint', 'error_type']
    )
}

def configure_router(app_router: APIRouter) -> APIRouter:
    """
    Configure the main v1 API router with security, validation, and monitoring.

    Args:
        app_router: Base FastAPI router instance

    Returns:
        APIRouter: Configured router with all middleware and endpoints
    """
    # Initialize rate limiter
    rate_limiter = RateLimiter(
        default_limit=RATE_LIMIT_CONFIG["default"],
        endpoint_limits=RATE_LIMIT_CONFIG
    )

    # Add CORS middleware
    app_router.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Add monitoring middleware
    @app_router.middleware("http")
    async def monitor_requests(request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        method = request.method
        endpoint = request.url.path

        try:
            # Track request metrics
            METRICS['requests_total'].labels(
                method=method,
                endpoint=endpoint
            ).inc()

            # Check rate limits
            await rate_limiter.check_rate_limit(request)

            # Process request
            response = await call_next(request)
            duration = time.time() - start_time

            # Record successful request duration
            METRICS['request_duration'].labels(
                method=method,
                endpoint=endpoint,
                status=response.status_code
            ).observe(duration)

            return response

        except Exception as e:
            duration = time.time() - start_time
            
            # Record error metrics
            METRICS['errors_total'].labels(
                method=method,
                endpoint=endpoint,
                error_type=type(e).__name__
            ).inc()
            
            # Record error request duration
            METRICS['request_duration'].labels(
                method=method,
                endpoint=endpoint,
                status=500
            ).observe(duration)

            logger.error(
                "Request failed",
                error=str(e),
                method=method,
                endpoint=endpoint,
                duration=duration
            )
            raise

    # Add health check endpoint
    @app_router.get("/health")
    async def health_check() -> dict:
        """Health check endpoint for monitoring."""
        return {
            "status": "healthy",
            "version": "1.0",
            "timestamp": time.time()
        }

    # Include routers from endpoints
    app_router.include_router(
        auth.router,
        prefix="/auth",
        tags=["authentication"]
    )
    app_router.include_router(
        detections.router,
        prefix="/detections", 
        tags=["detections"]
    )
    app_router.include_router(
        intelligence.router,
        prefix="/intelligence",
        tags=["intelligence"]
    )

    # Add error handlers
    @app_router.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> Response:
        """Custom HTTP exception handler with logging."""
        logger.error(
            "HTTP exception",
            status_code=exc.status_code,
            detail=exc.detail,
            headers=exc.headers
        )
        return Response(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=exc.headers
        )

    @app_router.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception) -> Response:
        """General exception handler with logging."""
        logger.error(
            "Unhandled exception",
            error=str(exc),
            error_type=type(exc).__name__
        )
        return Response(
            status_code=500,
            content={"detail": "Internal server error"}
        )

    return app_router

# Configure and export router
router = configure_router(router)

__all__ = ["router"]