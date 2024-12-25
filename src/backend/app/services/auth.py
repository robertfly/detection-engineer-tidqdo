"""
Authentication service implementing comprehensive security features including
user authentication, token management, and session handling with advanced protection.

Versions:
- fastapi: 0.104+
- sqlalchemy: 2.0+
- fastapi-limiter: 0.1.5+
- redis: 7.0+
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Union, Tuple
from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from fastapi_limiter import RateLimiter
from fastapi_limiter.depends import RateLimiter as RateLimitDep
import logging
from redis import Redis

# Internal imports
from ..models.user import User
from ..core.security import (
    get_password_hash,
    create_access_token,
    create_refresh_token,
    verify_token
)
from ..db.session import get_db
from ..core.config import settings
from ..core.logging import get_logger

# Initialize security logger
security_logger = get_logger("security.auth")

# Initialize OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="api/v1/auth/login",
    auto_error=True
)

# Initialize rate limiter
rate_limiter = RateLimiter(
    redis_url=settings.get_redis_url(),
    prefix="auth_limiter"
)

# Security constants
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
TOKEN_BLACKLIST_TTL = timedelta(hours=24)

# Initialize Redis for token blacklist
redis_client = Redis.from_url(
    settings.get_redis_url(),
    decode_responses=True
)

async def authenticate_user(
    db: Session,
    email: str,
    password: str,
    device_info: Dict[str, str]
) -> Tuple[Optional[User], Optional[str]]:
    """
    Authenticate user with comprehensive security checks and brute force protection.
    
    Args:
        db: Database session
        email: User email
        password: User password
        device_info: Client device information for fingerprinting
        
    Returns:
        Tuple[Optional[User], Optional[str]]: Authenticated user and error message if any
    """
    # Rate limit check
    key = f"auth_attempts:{email}"
    if redis_client.get(key) and int(redis_client.get(key)) >= MAX_FAILED_ATTEMPTS:
        security_logger.warning(
            "Authentication blocked due to rate limit",
            extra={
                "email": email,
                "device_info": device_info,
                "reason": "rate_limit_exceeded"
            }
        )
        return None, "Account temporarily locked. Please try again later."

    try:
        # Query user
        user = db.query(User).filter(User.email == email).first()
        if not user:
            security_logger.warning(
                "Authentication failed - user not found",
                extra={"email": email}
            )
            return None, "Invalid credentials"

        # Check account lockout
        if user.lockout_until and user.lockout_until > datetime.utcnow():
            security_logger.warning(
                "Authentication blocked - account locked",
                extra={"user_id": str(user.id)}
            )
            return None, "Account locked. Please try again later."

        # Verify password
        if not user.verify_password(password):
            # Increment failed attempts
            redis_client.incr(key)
            redis_client.expire(key, LOCKOUT_DURATION)
            
            user.increment_failed_attempts()
            db.commit()
            
            security_logger.warning(
                "Authentication failed - invalid password",
                extra={
                    "user_id": str(user.id),
                    "failed_attempts": user.failed_login_attempts
                }
            )
            return None, "Invalid credentials"

        # Reset failed attempts on success
        user.reset_failed_attempts()
        redis_client.delete(key)
        
        # Update last login
        user.update_last_login()
        db.commit()

        security_logger.info(
            "Authentication successful",
            extra={
                "user_id": str(user.id),
                "device_info": device_info
            }
        )
        return user, None

    except Exception as e:
        security_logger.error(
            "Authentication error",
            extra={
                "error": str(e),
                "email": email
            }
        )
        return None, "Authentication failed"

async def get_current_user(
    db: Session,
    token: str,
    device_info: Dict[str, str]
) -> User:
    """
    Validate current user from JWT token with enhanced security checks.
    
    Args:
        db: Database session
        token: JWT access token
        device_info: Client device information
        
    Returns:
        User: Validated current user
        
    Raises:
        HTTPException: If token validation fails
    """
    try:
        # Check token blacklist
        if redis_client.get(f"blacklist:{token}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked"
            )

        # Verify token
        payload = verify_token(token, "access")
        
        # Validate token fingerprint
        if payload.get("fingerprint") != _generate_fingerprint(device_info):
            security_logger.warning(
                "Token fingerprint mismatch",
                extra={
                    "user_id": payload.get("sub"),
                    "device_info": device_info
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token fingerprint"
            )

        # Get user
        user = db.query(User).filter(User.id == payload.get("sub")).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )

        security_logger.info(
            "Token validation successful",
            extra={
                "user_id": str(user.id),
                "token_type": "access"
            }
        )
        return user

    except HTTPException:
        raise
    except Exception as e:
        security_logger.error(
            "Token validation error",
            extra={"error": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

async def create_user_tokens(
    user: User,
    device_info: Dict[str, str]
) -> Dict[str, str]:
    """
    Create access and refresh tokens with enhanced security features.
    
    Args:
        user: User object
        device_info: Client device information
        
    Returns:
        Dict[str, str]: Access and refresh tokens with metadata
    """
    try:
        # Generate device fingerprint
        fingerprint = _generate_fingerprint(device_info)
        
        # Create token payload
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "fingerprint": fingerprint
        }

        # Generate tokens
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        security_logger.info(
            "Tokens created successfully",
            extra={
                "user_id": str(user.id),
                "device_info": device_info
            }
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }

    except Exception as e:
        security_logger.error(
            "Token creation error",
            extra={
                "error": str(e),
                "user_id": str(user.id)
            }
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating tokens"
        )

async def refresh_access_token(
    db: Session,
    refresh_token: str,
    device_info: Dict[str, str]
) -> Dict[str, str]:
    """
    Refresh access token with rotation security.
    
    Args:
        db: Database session
        refresh_token: Refresh token
        device_info: Client device information
        
    Returns:
        Dict[str, str]: New access token with metadata
    """
    try:
        # Verify refresh token
        payload = verify_token(refresh_token, "refresh")
        
        # Validate fingerprint
        if payload.get("fingerprint") != _generate_fingerprint(device_info):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token fingerprint"
            )

        # Get user
        user = db.query(User).filter(User.id == payload.get("sub")).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )

        # Create new access token
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "fingerprint": _generate_fingerprint(device_info)
        }
        
        new_access_token = create_access_token(token_data)

        security_logger.info(
            "Access token refreshed",
            extra={
                "user_id": str(user.id),
                "device_info": device_info
            }
        )

        return {
            "access_token": new_access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }

    except HTTPException:
        raise
    except Exception as e:
        security_logger.error(
            "Token refresh error",
            extra={"error": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not refresh token"
        )

def _generate_fingerprint(device_info: Dict[str, str]) -> str:
    """
    Generate secure device fingerprint for token binding.
    
    Args:
        device_info: Client device information
        
    Returns:
        str: Device fingerprint hash
    """
    import hashlib
    
    # Combine relevant device information
    fingerprint_data = f"{device_info.get('user_agent', '')}"
    fingerprint_data += f"{device_info.get('ip', '')}"
    fingerprint_data += f"{device_info.get('platform', '')}"
    
    # Generate SHA-256 hash
    return hashlib.sha256(fingerprint_data.encode()).hexdigest()

def revoke_token(token: str) -> None:
    """
    Add token to blacklist for revocation.
    
    Args:
        token: Token to revoke
    """
    try:
        # Add to blacklist with TTL
        redis_client.setex(
            f"blacklist:{token}",
            TOKEN_BLACKLIST_TTL,
            "revoked"
        )
        
        security_logger.info(
            "Token revoked successfully",
            extra={"token_hash": _generate_fingerprint({"token": token})}
        )
    
    except Exception as e:
        security_logger.error(
            "Token revocation error",
            extra={"error": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error revoking token"
        )