"""
Main entry point for the API endpoints module that aggregates and exports all API routers
for the detection engineering platform. Implements a modular API architecture with
comprehensive security controls, rate limiting, and monitoring capabilities.

Versions:
- fastapi: 0.104+
- prometheus_client: 0.17+
- structlog: 23.1+
"""

from fastapi import APIRouter, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Histogram
import structlog
from typing import Callable
import time

# Internal imports
from .auth import router as auth_router
from .detections import router as detections_router
from ..middleware import (
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
    LoggingMiddleware
)

# Configure structured logging
logger = structlog.get_logger(__name__)

# Initialize metrics
REQUEST_COUNTER = Counter(
    "api_requests_total",
    "Total number of API requests",
    ["method", "endpoint", "status"]
)
REQUEST_LATENCY = Histogram(
    "api_request_latency_seconds",
    "API request latency in seconds",
    ["method", "endpoint"]
)

# Initialize main API router with prefix and tags
api_router = APIRouter(
    prefix="/api/v1",
    tags=["api"],
    responses={
        404: {"description": "Not found"},
        500: {"description": "Internal server error"}
    }
)

# Custom middleware for request timing
@api_router.middleware("http")
async def add_timing_header(request: Request, call_next: Callable) -> Response:
    """Add response timing header and track metrics."""
    start_time = time.time()
    
    response = await call_next(request)
    
    # Calculate request duration
    duration = time.time() - start_time
    
    # Add timing header
    response.headers["X-Response-Time"] = f"{duration:.3f}s"
    
    # Record metrics
    REQUEST_COUNTER.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    REQUEST_LATENCY.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)
    
    return response

# Include routers with prefix and tags
api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["authentication"]
)

api_router.include_router(
    detections_router,
    prefix="/detections",
    tags=["detections"]
)

# Add middleware in correct order
api_router.middleware = [
    # Rate limiting - 1000 requests per hour per client
    RateLimitMiddleware(
        rate_limit="1000/hour",
        exclude_paths=["/api/v1/auth/login", "/api/v1/auth/refresh"]
    ),
    
    # Security headers
    SecurityHeadersMiddleware(
        headers={
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        }
    ),
    
    # Request/Response logging with correlation IDs
    LoggingMiddleware(
        logger=logger,
        exclude_paths=["/api/v1/health", "/metrics"]
    )
]

# Export aggregated router
__all__ = ["api_router"]

logger.info(
    "API router initialized",
    endpoints=[
        str(route.path) 
        for route in api_router.routes
    ]
)