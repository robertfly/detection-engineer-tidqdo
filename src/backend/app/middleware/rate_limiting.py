"""
FastAPI middleware implementation for distributed rate limiting using Redis-backed token bucket algorithm
with enhanced monitoring, security controls, and performance optimizations.

Versions:
- fastapi: 0.104.0+
- datadog: 0.44.0+
"""

from fastapi import FastAPI, Request, Response, HTTPException
from datadog import metrics
import asyncio
import time
import ipaddress
from typing import Dict, Optional, Tuple
import re

from ..core.config import settings
from ..utils.rate_limiting import RateLimiter
from ..core.logging import get_logger

# Configure logger with rate limiting context
logger = get_logger(__name__, {"component": "rate_limit_middleware"})

# Global constants
RATE_LIMIT_EXCEEDED = HTTPException(
    status_code=429,
    detail="Rate limit exceeded",
    headers={"Retry-After": "60"}
)

DEFAULT_RATE_LIMIT = 1000  # requests per minute
RATE_LIMIT_HEADERS = {
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset"
}

# Security constants
IP_HEADER_NAMES = ["X-Forwarded-For", "X-Real-IP"]
API_KEY_PATTERN = re.compile(r"^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$")

class RateLimitMiddleware:
    """
    FastAPI middleware for distributed rate limiting with enhanced monitoring and security controls.
    Implements token bucket algorithm using Redis for distributed rate limiting.
    """

    def __init__(
        self,
        app: FastAPI,
        endpoint_limits: Optional[Dict[str, int]] = None,
        security_config: Optional[Dict] = None
    ):
        """
        Initialize rate limit middleware with Redis connection pool and enhanced monitoring.

        Args:
            app: FastAPI application instance
            endpoint_limits: Optional endpoint-specific rate limits
            security_config: Optional security configuration overrides
        """
        self._app = app
        self._endpoint_limits = endpoint_limits or {}
        self._security_config = security_config or {}
        
        # Initialize rate limiter with Redis connection
        self._rate_limiter = RateLimiter(
            redis_url=settings.get_redis_url(),
            default_limit=DEFAULT_RATE_LIMIT,
            endpoint_limits=self._endpoint_limits
        )
        
        # Initialize metrics cache for performance
        self._metrics_cache = {}
        
        # Configure logger
        self._logger = logger.bind(
            rate_limits=self._endpoint_limits,
            security_config=self._security_config
        )
        
        # Register middleware
        app.middleware("http")(self.async_dispatch)
        
        # Initialize metrics
        metrics.gauge("rate_limiter.endpoints", len(self._endpoint_limits))
        self._logger.info("Rate limit middleware initialized")

    def get_client_id(self, request: Request) -> str:
        """
        Extract and validate client identifier with enhanced security checks.

        Args:
            request: FastAPI request object

        Returns:
            str: Validated client identifier (IP or API key)
        """
        # Check for API key in authorization header
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            api_key = auth_header.split(" ")[1]
            if API_KEY_PATTERN.match(api_key):
                return f"api:{api_key}"
            self._logger.warning("Invalid API key format detected")

        # Extract client IP with security checks
        for header in IP_HEADER_NAMES:
            ip_str = request.headers.get(header)
            if ip_str:
                # Get first IP in case of proxy chain
                ip_str = ip_str.split(",")[0].strip()
                try:
                    # Validate IP format
                    ipaddress.ip_address(ip_str)
                    return f"ip:{ip_str}"
                except ValueError:
                    self._logger.warning(
                        "Invalid IP address format",
                        ip=ip_str,
                        header=header
                    )

        # Fallback to remote address
        return f"ip:{request.client.host}"

    def get_rate_limit(self, endpoint_path: str, client_id: str) -> int:
        """
        Get and validate rate limit for specific endpoint with caching.

        Args:
            endpoint_path: API endpoint path
            client_id: Client identifier

        Returns:
            int: Validated requests per minute limit
        """
        # Check cache first
        cache_key = f"{endpoint_path}:{client_id}"
        if cache_key in self._metrics_cache:
            return self._metrics_cache[cache_key]

        # Get base limit for endpoint
        limit = self._endpoint_limits.get(endpoint_path, DEFAULT_RATE_LIMIT)

        # Apply client-specific adjustments
        if client_id.startswith("api:"):
            # API keys get higher limits
            limit = limit * 2
        elif client_id.startswith("ip:"):
            # IP-based limits are more restrictive
            limit = limit // 2

        # Cache result with 5-minute TTL
        self._metrics_cache[cache_key] = limit
        asyncio.create_task(self._clear_cache_entry(cache_key))

        return limit

    async def _clear_cache_entry(self, key: str) -> None:
        """Clear cached rate limit entry after TTL."""
        await asyncio.sleep(300)  # 5 minutes
        self._metrics_cache.pop(key, None)

    async def async_dispatch(self, request: Request, call_next) -> Response:
        """
        Middleware dispatch function with enhanced monitoring and security.

        Args:
            request: FastAPI request object
            call_next: Next middleware in chain

        Returns:
            Response: API response with rate limit headers
        """
        start_time = time.time()
        endpoint = request.url.path

        try:
            # Extract and validate client identifier
            client_id = self.get_client_id(request)

            # Get rate limit for endpoint
            rate_limit = self.get_rate_limit(endpoint, client_id)

            # Check rate limit
            is_limited, remaining, reset_time, retry_after = await self._rate_limiter.is_rate_limited(
                client_id=client_id,
                endpoint=endpoint,
                limit=rate_limit
            )

            # Record metrics
            metrics.increment(
                "rate_limiter.requests",
                tags=[
                    f"endpoint:{endpoint}",
                    f"client_type:{client_id.split(':')[0]}",
                    f"limited:{is_limited}"
                ]
            )

            if is_limited:
                # Log rate limit event
                self._logger.warning(
                    "Rate limit exceeded",
                    client_id=client_id,
                    endpoint=endpoint,
                    retry_after=retry_after
                )
                
                # Return rate limit response
                raise RATE_LIMIT_EXCEEDED

            # Process request
            response = await call_next(request)

            # Add rate limit headers
            response.headers["X-RateLimit-Limit"] = str(rate_limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(reset_time)

            # Record response time
            process_time = time.time() - start_time
            metrics.histogram(
                "rate_limiter.response_time",
                process_time,
                tags=[f"endpoint:{endpoint}"]
            )

            return response

        except HTTPException as e:
            # Re-raise HTTP exceptions
            raise

        except Exception as e:
            # Log unexpected errors
            self._logger.error(
                "Rate limiting error",
                error=str(e),
                endpoint=endpoint,
                exc_info=True
            )
            metrics.increment("rate_limiter.errors")
            
            # Fail open to avoid blocking legitimate traffic
            return await call_next(request)