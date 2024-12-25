"""
FastAPI middleware for comprehensive request/response logging with security context,
performance tracking, and audit trails.

Versions:
- fastapi: 0.104+
- starlette: 0.27+
- time: 3.11+
- uuid: 3.11+
"""

import time
from uuid import uuid4
from typing import Callable, Dict, Any
from fastapi.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..core.logging import get_logger
from ..core.config import settings

# Initialize structured logger with security context
logger = get_logger(__name__)

class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Enterprise-grade logging middleware for FastAPI providing request/response logging,
    security audit trails, and performance metrics tracking.
    """

    # Paths to exclude from logging for health checks and metrics
    EXCLUDED_PATHS = [
        '/health',
        '/metrics', 
        '/static/*',
        '/docs',
        '/redoc'
    ]

    # Headers that should be masked for security
    SENSITIVE_HEADERS = [
        'authorization',
        'cookie',
        'x-api-key',
        'x-forwarded-for',
        'x-real-ip'
    ]

    def __init__(self) -> None:
        """Initialize logging middleware with configuration."""
        super().__init__()
        # Performance tracking metrics
        self.total_requests = 0
        self.total_errors = 0
        self.total_duration = 0

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process and log HTTP request/response with security context and performance metrics.

        Args:
            request: The incoming HTTP request
            call_next: The next middleware handler

        Returns:
            Response: The processed HTTP response
        """
        # Generate correlation ID for request tracking
        correlation_id = str(uuid4())
        
        # Skip logging for excluded paths
        if any(request.url.path.startswith(path.replace('*', '')) for path in self.EXCLUDED_PATHS):
            return await call_next(request)

        # Record request start time with high precision
        start_time = time.perf_counter()

        # Extract request metadata with security context
        request_metadata = self.get_request_metadata(request)
        request_metadata['correlation_id'] = correlation_id

        # Log incoming request with structured format
        logger.info(
            "Incoming request",
            extra={
                "request": request_metadata,
                "event_type": "request_received",
                "environment": settings.ENVIRONMENT
            }
        )

        # Process request with error handling
        try:
            # Apply log sampling in production for high-traffic endpoints
            if settings.ENVIRONMENT == "production" and not self._should_sample():
                response = await call_next(request)
            else:
                response = await call_next(request)
                
            self.total_requests += 1
        except Exception as e:
            self.total_errors += 1
            logger.error(
                "Request processing failed",
                extra={
                    "error": str(e),
                    "correlation_id": correlation_id,
                    "request": request_metadata
                },
                exc_info=True
            )
            raise
        finally:
            # Calculate request duration with high precision
            duration = (time.perf_counter() - start_time) * 1000
            self.total_duration += duration

        # Extract response metadata with performance metrics
        response_metadata = self.get_response_metadata(response, duration)
        response_metadata['correlation_id'] = correlation_id

        # Log response with performance context
        logger.info(
            "Request completed",
            extra={
                "request": request_metadata,
                "response": response_metadata,
                "event_type": "request_completed",
                "duration_ms": duration
            }
        )

        # Add correlation headers to response
        response.headers['X-Correlation-ID'] = correlation_id
        
        return response

    def get_request_metadata(self, request: Request) -> Dict[str, Any]:
        """
        Extract comprehensive request metadata with security context.

        Args:
            request: The incoming HTTP request

        Returns:
            Dict containing structured request metadata
        """
        # Extract basic request information
        metadata = {
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "client_host": request.client.host if request.client else None,
            "timestamp": time.time()
        }

        # Extract and mask sensitive headers
        headers = {}
        for key, value in request.headers.items():
            if key.lower() in self.SENSITIVE_HEADERS:
                headers[key] = "***REDACTED***"
            else:
                headers[key] = value
        metadata["headers"] = headers

        # Add security context
        metadata.update({
            "user_agent": request.headers.get("user-agent"),
            "referer": request.headers.get("referer"),
            "x_forwarded_for": headers.get("x-forwarded-for", "***REDACTED***"),
            "session_id": request.cookies.get("session_id", "no_session")
        })

        return metadata

    def get_response_metadata(self, response: Response, duration: float) -> Dict[str, Any]:
        """
        Extract response metadata with performance metrics.

        Args:
            response: The HTTP response
            duration: Request processing duration in milliseconds

        Returns:
            Dict containing response metadata and metrics
        """
        # Get response status information
        status_code = response.status_code
        status_group = f"{status_code//100}xx"

        # Extract filtered headers
        headers = {
            k: "***REDACTED***" if k.lower() in self.SENSITIVE_HEADERS else v
            for k, v in response.headers.items()
        }

        # Build response metadata
        metadata = {
            "status_code": status_code,
            "status_group": status_group,
            "headers": headers,
            "duration_ms": round(duration, 2),
            "timestamp": time.time()
        }

        # Add performance metrics
        if self.total_requests > 0:
            metadata.update({
                "avg_response_time": round(self.total_duration / self.total_requests, 2),
                "error_rate": round(self.total_errors / self.total_requests * 100, 2),
                "total_requests": self.total_requests
            })

        return metadata

    def _should_sample(self) -> bool:
        """Determine if request should be sampled based on configuration."""
        if not hasattr(settings, 'LOG_SAMPLING_RATE'):
            return True
        return time.time() % 100 < settings.LOG_SAMPLING_RATE