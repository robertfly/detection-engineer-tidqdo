"""
Authentication endpoints implementing secure user authentication, registration, and session management
with comprehensive security features including rate limiting, brute force protection, device fingerprinting,
and GDPR compliance.

Version: 1.0
"""

# External imports - versions specified for security tracking
from fastapi import APIRouter, Depends, HTTPException, status, Request  # fastapi v0.104+
from fastapi_cache import Cache  # fastapi-cache v0.1.0+
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import logging
from typing import Dict, Optional
from uuid import uuid4

# Internal imports
from ....schemas.auth import UserLogin, UserRegister, Token, UserResponse
from ....db.session import get_db
from ....core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    verify_token
)
from ....models.user import User
from ....core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router with rate limiting
router = APIRouter(prefix='/auth', tags=['auth'])

# Initialize cache for rate limiting and token management
cache = Cache()

async def check_rate_limit(request: Request, limit: int = 100, window: int = 60) -> None:
    """
    Implement rate limiting per IP address with cache-based tracking.
    
    Args:
        request: FastAPI request object
        limit: Maximum requests per window
        window: Time window in seconds
        
    Raises:
        HTTPException: If rate limit exceeded
    """
    client_ip = request.client.host
    cache_key = f"ratelimit:{client_ip}"
    
    # Get current request count
    request_count = await cache.get(cache_key) or 0
    
    if request_count >= limit:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests"
        )
    
    # Increment request count
    await cache.set(cache_key, request_count + 1, expire=window)

@router.post("/login", response_model=Token)
async def login(
    login_data: UserLogin,
    request: Request,
    db: Session = Depends(get_db)
) -> Dict:
    """
    Authenticate user and issue JWT tokens with enhanced security features.
    
    Args:
        login_data: User login credentials
        request: FastAPI request object
        db: Database session
        
    Returns:
        dict: Access and refresh tokens with metadata
        
    Raises:
        HTTPException: For authentication failures
    """
    # Check rate limit
    await check_rate_limit(request)
    
    try:
        # Get user from database
        user = db.query(User).filter(User.email == login_data.email).first()
        if not user:
            logger.warning(f"Login attempt for non-existent user: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
            
        # Verify password and account status
        if not verify_password(login_data.password, user.hashed_password):
            logger.warning(f"Failed login attempt for user: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
            
        if not user.is_active:
            logger.warning(f"Login attempt for inactive account: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is inactive"
            )
        
        # Create token payload
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "device_id": login_data.device_id
        }
        
        # Generate tokens
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        
        # Update user login tracking
        user.update_last_login()
        db.commit()
        
        # Prepare response
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "access_token_expires": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
            "refresh_token_expires": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "token_status": "active"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserRegister,
    request: Request,
    db: Session = Depends(get_db)
) -> Dict:
    """
    Register new user with enhanced validation and GDPR compliance.
    
    Args:
        user_data: User registration data
        request: FastAPI request object
        db: Database session
        
    Returns:
        dict: Created user data
        
    Raises:
        HTTPException: For registration failures
    """
    # Check rate limit
    await check_rate_limit(request, limit=10, window=3600)  # Stricter limit for registration
    
    try:
        # Check if email exists
        if db.query(User).filter(User.email == user_data.email).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
            
        # Verify GDPR consent
        if not user_data.gdpr_consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GDPR consent required"
            )
        
        # Create new user
        new_user = User(
            email=user_data.email,
            name=user_data.name,
            role=user_data.role,
            gdpr_consent=user_data.gdpr_consent,
            gdpr_consent_date=datetime.utcnow()
        )
        
        # Set password with secure hashing
        new_user.hashed_password = get_password_hash(user_data.password)
        
        # Save to database
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        logger.info(f"New user registered: {new_user.email}")
        
        # Prepare response
        return {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role,
            "is_active": new_user.is_active,
            "created_at": new_user.created_at,
            "updated_at": new_user.updated_at,
            "mfa_enabled": False,
            "security_groups": [],
            "permissions": {},
            "account_status": "active"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )

@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_token: str,
    request: Request,
    db: Session = Depends(get_db)
) -> Dict:
    """
    Refresh access token with enhanced security validation.
    
    Args:
        refresh_token: Current refresh token
        request: FastAPI request object
        db: Database session
        
    Returns:
        dict: New access and refresh tokens
        
    Raises:
        HTTPException: For token refresh failures
    """
    # Check rate limit
    await check_rate_limit(request)
    
    try:
        # Verify refresh token
        payload = verify_token(refresh_token, "refresh")
        
        # Get user
        user = db.query(User).filter(User.id == payload["sub"]).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Create new token payload
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "device_id": payload.get("device_id")
        }
        
        # Generate new tokens
        new_access_token = create_access_token(token_data)
        new_refresh_token = create_refresh_token(token_data)
        
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "access_token_expires": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
            "refresh_token_expires": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "token_status": "active"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )