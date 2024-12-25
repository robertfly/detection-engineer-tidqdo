"""
Enhanced authentication middleware implementing comprehensive security features including
JWT validation, API key authentication, rate limiting, and audit logging.

Versions:
- fastapi: 0.104.0+
- sqlalchemy: 2.0.0+
- fastapi-cache: 0.1.0+
- slowapi: 0.1.0+
"""

from typing import List, Dict, Optional, Callable
from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session
from fastapi_cache import Cache
from slowapi import RateLimiter
import logging
import time
from datetime import datetime

# Internal imports
from ..core.security import verify_token
from ..services.auth import verify_api_key
from ..models.user import User
from ..core.logging import get_logger

# Initialize security logger
security_logger = get_logger("security.middleware")

# Security constants
EXCLUDE_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register", "/health"]
AUTH_HEADER_NAME = "Authorization"
API_KEY_HEADER = "X-API-Key"
RATE_LIMIT_WINDOW = 3600
RATE_LIMIT_MAX_REQUESTS = 1000
CACHE_TTL = 300
SECURITY_LOG_LEVEL = "INFO"

class AuthMiddleware:
    """
    Enhanced authentication middleware with comprehensive security features including
    rate limiting, device fingerprinting, and audit logging.
    """

    def __init__(
        self,
        app,
        exclude_paths: List[str] = None,
        security_config: Dict = None
    ):
        """
        Initialize authentication middleware with security configuration.

        Args:
            app: FastAPI application instance
            exclude_paths: List of paths to exclude from authentication
            security_config: Additional security configuration
        """
        self.app = app
        self.exclude_paths = exclude_paths or EXCLUDE_PATHS
        self.rate_limiter = RateLimiter(
            key_func=self._get_rate_limit_key,
            rate=security_config.get("rate_limit", RATE_LIMIT_MAX_REQUESTS),
            time_window=security_config.get("rate_window", RATE_LIMIT_WINDOW)
        )
        self.cache = Cache()
        self.security_logger = security_logger

    async def authenticate(self, request: Request, call_next: Callable):
        """
        Enhanced authentication handler with security features.

        Args:
            request: FastAPI request object
            call_next: Next middleware in chain

        Returns:
            Response with security headers
        """
        start_time = time.time()
        path = request.url.path

        try:
            # Skip authentication for excluded paths
            if self._is_excluded_path(path):
                return await call_next(request)

            # Extract device fingerprint
            device_info = self._get_device_info(request)

            # Apply rate limiting
            if not await self._check_rate_limit(request):
                self.security_logger.warning(
                    "Rate limit exceeded",
                    extra={
                        "ip": device_info["ip"],
                        "path": path,
                        "device_info": device_info
                    }
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded"
                )

            # Attempt authentication
            user = await self._authenticate_request(request, device_info)
            request.state.user = user

            # Process request
            response = await call_next(request)

            # Add security headers
            response.headers.update(self._get_security_headers())

            # Log successful request
            self._log_request(request, response, start_time, user)

            return response

        except HTTPException as e:
            self._log_auth_failure(request, e, device_info)
            raise
        except Exception as e:
            self.security_logger.error(
                "Authentication error",
                extra={
                    "error": str(e),
                    "path": path,
                    "device_info": device_info
                }
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication failed"
            )

    async def _authenticate_request(
        self,
        request: Request,
        device_info: Dict
    ) -> Optional[User]:
        """
        Authenticate request using JWT token or API key.

        Args:
            request: FastAPI request
            device_info: Client device information

        Returns:
            Authenticated user or None
        """
        # Check for JWT token
        auth_header = request.headers.get(AUTH_HEADER_NAME)
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            payload = verify_token(token, "access")
            
            # Verify token fingerprint
            if payload.get("fingerprint") != self._generate_fingerprint(device_info):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token fingerprint"
                )
            
            return await self._get_cached_user(payload.get("sub"), request)

        # Check for API key
        api_key = request.headers.get(API_KEY_HEADER)
        if api_key:
            return await verify_api_key(api_key, device_info)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    async def _get_cached_user(self, user_id: str, request: Request) -> User:
        """
        Get user from cache or database.

        Args:
            user_id: User ID
            request: FastAPI request

        Returns:
            User object
        """
        cache_key = f"user:{user_id}"
        user = await self.cache.get(cache_key)
        
        if not user:
            db = request.state.db
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                await self.cache.set(cache_key, user, ttl=CACHE_TTL)
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
            
        return user

    def _get_device_info(self, request: Request) -> Dict:
        """Extract device information for fingerprinting."""
        return {
            "ip": request.client.host,
            "user_agent": request.headers.get("User-Agent", ""),
            "platform": request.headers.get("Sec-Ch-Ua-Platform", ""),
            "forwarded_for": request.headers.get("X-Forwarded-For", "")
        }

    def _generate_fingerprint(self, device_info: Dict) -> str:
        """Generate secure device fingerprint."""
        import hashlib
        
        fingerprint_data = (
            f"{device_info.get('ip', '')}"
            f"{device_info.get('user_agent', '')}"
            f"{device_info.get('platform', '')}"
        )
        return hashlib.sha256(fingerprint_data.encode()).hexdigest()

    async def _check_rate_limit(self, request: Request) -> bool:
        """Check rate limit for request."""
        return await self.rate_limiter.is_allowed(request)

    def _get_rate_limit_key(self, request: Request) -> str:
        """Generate rate limit key based on IP and path."""
        return f"{request.client.host}:{request.url.path}"

    def _is_excluded_path(self, path: str) -> bool:
        """Check if path is excluded from authentication."""
        return any(path.startswith(excluded) for excluded in self.exclude_paths)

    def _get_security_headers(self) -> Dict:
        """Get security headers for response."""
        return {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        }

    def _log_request(
        self,
        request: Request,
        response,
        start_time: float,
        user: Optional[User]
    ) -> None:
        """Log successful request with security context."""
        self.security_logger.info(
            "Request processed",
            extra={
                "user_id": str(user.id) if user else None,
                "path": request.url.path,
                "method": request.method,
                "status_code": response.status_code,
                "duration": time.time() - start_time,
                "ip": request.client.host,
                "user_agent": request.headers.get("User-Agent")
            }
        )

    def _log_auth_failure(
        self,
        request: Request,
        exception: HTTPException,
        device_info: Dict
    ) -> None:
        """Log authentication failure with security context."""
        self.security_logger.warning(
            "Authentication failed",
            extra={
                "error": str(exception.detail),
                "status_code": exception.status_code,
                "path": request.url.path,
                "method": request.method,
                "device_info": device_info
            }
        )

async def get_current_user(
    request: Request,
    db: Session,
    cache: Cache
) -> User:
    """
    Enhanced user authentication dependency with caching.

    Args:
        request: FastAPI request
        db: Database session
        cache: Cache instance

    Returns:
        Authenticated user
    """
    if not hasattr(request.state, "user"):
        auth_header = request.headers.get(AUTH_HEADER_NAME)
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"}
            )

        token = auth_header.split(" ")[1]
        device_info = AuthMiddleware._get_device_info(request)
        
        try:
            payload = verify_token(token, "access")
            user_id = payload.get("sub")
            
            # Get user from cache or database
            cache_key = f"user:{user_id}"
            user = await cache.get(cache_key)
            
            if not user:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    await cache.set(cache_key, user, ttl=CACHE_TTL)
            
            if not user or not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found or inactive"
                )
                
            request.state.user = user
            
        except Exception as e:
            security_logger.error(
                "User authentication failed",
                extra={
                    "error": str(e),
                    "device_info": device_info
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not authenticate user"
            )
    
    return request.state.user

async def verify_api_auth(
    request: Request,
    db: Session,
    rate_limiter: RateLimiter
) -> User:
    """
    Enhanced API key authentication with rate limiting.

    Args:
        request: FastAPI request
        db: Database session
        rate_limiter: Rate limiter instance

    Returns:
        Authenticated user
    """
    api_key = request.headers.get(API_KEY_HEADER)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required"
        )

    # Apply rate limiting
    if not await rate_limiter.is_allowed(request):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )

    device_info = AuthMiddleware._get_device_info(request)
    try:
        user = await verify_api_key(api_key, device_info)
        request.state.user = user
        return user
    except Exception as e:
        security_logger.error(
            "API authentication failed",
            extra={
                "error": str(e),
                "device_info": device_info
            }
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )