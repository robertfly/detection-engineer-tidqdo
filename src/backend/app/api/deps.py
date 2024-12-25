"""
FastAPI dependency injection module providing enterprise-grade authentication, authorization,
and security dependencies with comprehensive role-based access control, token validation,
and session management capabilities.

Versions:
- fastapi: 0.104+
- sqlalchemy: 2.0+
- fastapi-cache: 0.1+
"""

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from fastapi_cache import Cache
from fastapi_cache.decorator import cache
from datetime import datetime, timedelta
import json
import logging
from typing import Callable, List, Optional

# Internal imports
from ..core.security import verify_token
from ..db.session import get_db
from ..models.user import User
from ..core.logging import SecurityLogger

# Configure security logger
security_logger = SecurityLogger()

# Initialize security dependencies
oauth2_scheme = HTTPBearer(auto_error=True)

# Constants
ROLE_CACHE_TTL = 300  # Role cache TTL in seconds
MAX_FAILED_ATTEMPTS = 5  # Maximum failed authentication attempts
ROLE_HIERARCHY = {
    "admin": ["all"],  # Admin has access to all roles
    "enterprise": ["community"],  # Enterprise includes community access
    "community": ["public"]  # Community includes public access
}

async def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
    client_ip: str = None
) -> User:
    """
    Enhanced dependency to get authenticated user with comprehensive security checks.
    
    Args:
        db: Database session
        token: JWT bearer token
        client_ip: Client IP address for security tracking
        
    Returns:
        User: Authenticated and validated user model instance
        
    Raises:
        HTTPException: If authentication or validation fails
    """
    try:
        # Verify JWT token and check blacklist
        token_data = verify_token(token.credentials, "access")
        
        if not token_data:
            security_logger.log_auth_event(
                "token_invalid",
                client_ip=client_ip,
                status="failed"
            )
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Query user and validate security fields
        user = db.query(User).filter(User.id == token_data.get("sub")).first()
        
        if not user:
            security_logger.log_auth_event(
                "user_not_found",
                client_ip=client_ip,
                status="failed"
            )
            raise HTTPException(
                status_code=401,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Check for account lockout
        if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
            security_logger.log_auth_event(
                "account_locked",
                user_id=str(user.id),
                client_ip=client_ip,
                status="blocked"
            )
            raise HTTPException(
                status_code=401,
                detail="Account locked due to multiple failed attempts"
            )

        # Update security tracking
        user.last_login = datetime.utcnow()
        user.failed_attempts = 0
        db.commit()

        security_logger.log_auth_event(
            "authentication_success",
            user_id=str(user.id),
            client_ip=client_ip,
            status="success"
        )
        
        return user

    except Exception as e:
        logging.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"}
        )

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Dependency to ensure user is active with additional security checks.
    
    Args:
        current_user: Authenticated user instance
        
    Returns:
        User: Verified active user
        
    Raises:
        HTTPException: If user is inactive or validation fails
    """
    if not current_user.is_active:
        security_logger.log_auth_event(
            "inactive_user_access",
            user_id=str(current_user.id),
            status="blocked"
        )
        raise HTTPException(
            status_code=403,
            detail="Inactive user account"
        )

    return current_user

def check_role_permission(
    allowed_roles: List[str],
    use_cache: bool = True,
    cache_ttl: int = ROLE_CACHE_TTL
) -> Callable:
    """
    Enhanced role permission checker with hierarchy and caching support.
    
    Args:
        allowed_roles: List of roles allowed to access the resource
        use_cache: Whether to use role cache
        cache_ttl: Cache TTL in seconds
        
    Returns:
        Callable: Role checking dependency function
    """
    async def role_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> bool:
        # Generate cache key if caching enabled
        if use_cache:
            cache_key = f"role_check:{current_user.id}:{','.join(allowed_roles)}"
            cached_result = await Cache.get(cache_key)
            
            if cached_result is not None:
                return json.loads(cached_result)

        # Check user's role against allowed roles including hierarchy
        user_role = current_user.role
        permitted = False

        for allowed_role in allowed_roles:
            # Direct role match
            if user_role == allowed_role:
                permitted = True
                break
                
            # Check role hierarchy
            if user_role in ROLE_HIERARCHY:
                if allowed_role in ROLE_HIERARCHY[user_role]:
                    permitted = True
                    break

        # Log role check attempt
        security_logger.log_role_check(
            user_id=str(current_user.id),
            required_roles=allowed_roles,
            user_role=user_role,
            granted=permitted
        )

        if not permitted:
            raise HTTPException(
                status_code=403,
                detail=f"User role '{user_role}' not authorized for this operation"
            )

        # Cache successful result if enabled
        if use_cache:
            await Cache.set(
                cache_key,
                json.dumps(permitted),
                expire=cache_ttl
            )

        return permitted

    return role_checker