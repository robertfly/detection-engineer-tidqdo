# External imports - versions specified for security tracking
from fastapi.middleware.cors import CORSMiddleware  # fastapi v0.104.0
from fastapi import Request, Response  # fastapi v0.104.0
from cachetools import TTLCache  # cachetools v5.3.0
import re
import time
import logging
from typing import List, Dict, Callable, Any

# Internal imports
from ..core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Global constants for CORS configuration
DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
DEFAULT_ALLOWED_HEADERS = ["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"]
ORIGIN_CACHE_SIZE = 1000  # Maximum number of cached origin validation results
ORIGIN_CACHE_TTL = 300   # Cache TTL in seconds (5 minutes)

class CustomCORSMiddleware:
    """
    Enhanced CORS middleware with advanced security controls, caching, and monitoring capabilities.
    Implements strict origin validation, rate limiting, and comprehensive security event tracking.
    """

    def __init__(self, app: Any) -> None:
        """
        Initialize the enhanced CORS middleware with security features and caching.

        Args:
            app: The ASGI application
        """
        # Initialize base CORS middleware
        self.app = CORSMiddleware(
            app=app,
            allow_origins=[],  # We'll handle origin validation manually
            allow_methods=DEFAULT_ALLOWED_METHODS,
            allow_headers=DEFAULT_ALLOWED_HEADERS,
            allow_credentials=True,
            max_age=600  # 10 minutes cache for preflight requests
        )

        # Initialize security controls
        self.allowed_origins = settings.BACKEND_CORS_ORIGINS
        self.allowed_methods = DEFAULT_ALLOWED_METHODS
        self.allowed_headers = DEFAULT_ALLOWED_HEADERS
        self.allow_credentials = True

        # Initialize caching and monitoring
        self.origin_cache = TTLCache(
            maxsize=ORIGIN_CACHE_SIZE,
            ttl=ORIGIN_CACHE_TTL
        )
        self.origin_request_counts: Dict[str, Dict[str, Any]] = {}

        logger.info("CustomCORSMiddleware initialized with enhanced security controls")

    async def __call__(self, scope: Dict, receive: Callable, send: Callable) -> None:
        """
        Process incoming requests with enhanced security validation and monitoring.

        Args:
            scope: ASGI scope dictionary
            receive: ASGI receive callable
            send: ASGI send callable
        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Extract request details
        request = Request(scope)
        origin = request.headers.get("origin")

        # Handle requests without origin header
        if not origin:
            if request.method != "OPTIONS":
                await self.app(scope, receive, send)
            else:
                response = Response(status_code=400)
                await response(scope, receive, send)
            return

        # Validate origin and track requests
        is_valid = self.is_origin_allowed(origin)
        is_within_rate_limit = self.track_request(origin)

        if not is_valid:
            logger.warning(f"Invalid origin attempted access: {origin}")
            response = Response(
                status_code=403,
                content={"detail": "Origin not allowed"}
            )
            await response(scope, receive, send)
            return

        if not is_within_rate_limit:
            logger.warning(f"Rate limit exceeded for origin: {origin}")
            response = Response(
                status_code=429,
                content={"detail": "Rate limit exceeded"}
            )
            await response(scope, receive, send)
            return

        # Handle preflight requests
        if request.method == "OPTIONS":
            response = Response(
                headers={
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": ",".join(self.allowed_methods),
                    "Access-Control-Allow-Headers": ",".join(self.allowed_headers),
                    "Access-Control-Allow-Credentials": "true" if self.allow_credentials else "false",
                    "Access-Control-Max-Age": "600",
                },
                status_code=200
            )
            await response(scope, receive, send)
            return

        # Modify CORS headers for the response
        async def send_wrapper(message: Dict) -> None:
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers[b"Access-Control-Allow-Origin"] = origin.encode()
                if self.allow_credentials:
                    headers[b"Access-Control-Allow-Credentials"] = b"true"
                message["headers"] = [(k, v) for k, v in headers.items()]
            await send(message)

        await self.app(scope, receive, send_wrapper)

    def is_origin_allowed(self, origin: str) -> bool:
        """
        Enhanced origin validation with pattern matching and caching.

        Args:
            origin: The origin to validate

        Returns:
            bool: True if origin is allowed, False otherwise
        """
        # Check cache first
        if origin in self.origin_cache:
            return self.origin_cache[origin]

        # Validate origin against allowed origins
        is_valid = False
        for allowed_origin in self.allowed_origins:
            # Handle wildcard domains (e.g., *.example.com)
            if allowed_origin.startswith("*."):
                pattern = allowed_origin.replace("*.", ".*\.")
                if re.match(f"^https?://{pattern}$", origin):
                    is_valid = True
                    break
            # Exact match
            elif allowed_origin == origin:
                is_valid = True
                break

        # Cache the result
        self.origin_cache[origin] = is_valid
        return is_valid

    def track_request(self, origin: str) -> bool:
        """
        Track and rate limit requests per origin.

        Args:
            origin: The requesting origin

        Returns:
            bool: True if request is allowed, False if rate limited
        """
        current_time = time.time()
        
        # Initialize or update tracking data
        if origin not in self.origin_request_counts:
            self.origin_request_counts[origin] = {
                "count": 0,
                "window_start": current_time
            }
        
        # Reset counter if window has expired (1 minute window)
        if current_time - self.origin_request_counts[origin]["window_start"] >= 60:
            self.origin_request_counts[origin] = {
                "count": 1,
                "window_start": current_time
            }
            return True

        # Increment counter and check rate limit
        self.origin_request_counts[origin]["count"] += 1
        
        # Apply rate limiting based on settings
        if self.origin_request_counts[origin]["count"] > settings.API_RATE_LIMIT:
            logger.warning(f"Rate limit exceeded for origin: {origin}")
            return False

        return True