"""
Core security module implementing authentication, password hashing, and JWT token management
with enhanced token rotation and refresh capabilities using industry-standard encryption and security practices.

Version: 1.0
"""

# External imports with version specifications
from jose import jwt, JWTError  # python-jose v3.3.0+
from argon2 import PasswordHasher  # argon2-cffi v21.3.0+
from datetime import datetime, timedelta  # standard library
from uuid import uuid4, UUID  # standard library
from fastapi import HTTPException, status  # fastapi v0.104.0+
from typing import Dict, Optional, Union
import logging
from copy import deepcopy

# Internal imports
from ..core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Argon2 password hasher with industry-standard parameters
pwd_hasher = PasswordHasher(
    time_cost=2,          # Number of iterations
    memory_cost=102400,   # Memory usage in kB (100 MB)
    parallelism=8,        # Number of parallel threads
    hash_len=32,          # Length of the hash in bytes
    salt_len=16           # Length of the salt in bytes
)

def get_password_hash(password: str) -> str:
    """
    Hash password using Argon2id algorithm with enhanced security parameters.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: Argon2id hashed password
        
    Raises:
        ValueError: If password doesn't meet minimum requirements
    """
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    
    try:
        return pwd_hasher.hash(password)
    except Exception as e:
        logger.error(f"Password hashing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password processing failed"
        )

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify password against hashed version with timing attack protection.
    
    Args:
        plain_password: Password to verify
        hashed_password: Argon2id hashed password
        
    Returns:
        bool: True if password matches hash
    """
    if not plain_password or not hashed_password:
        return False
    
    try:
        pwd_hasher.verify(hashed_password, plain_password)
        return True
    except Exception:
        return False

def create_access_token(
    data: Dict[str, Union[str, int, bool]],
    expires_delta: Optional[int] = None
) -> str:
    """
    Create JWT access token with enhanced security claims.
    
    Args:
        data: Token payload data
        expires_delta: Optional custom expiration time in minutes
        
    Returns:
        str: Encoded JWT access token
    """
    token_data = deepcopy(data)
    
    # Set expiration time
    expire_minutes = expires_delta or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.utcnow() + timedelta(minutes=expire_minutes)
    
    # Add standard security claims
    token_data.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "nbf": datetime.utcnow(),
        "jti": str(uuid4()),
        "type": "access"
    })
    
    try:
        encoded_token = jwt.encode(
            token_data,
            settings.SECRET_KEY.get_secret_value(),
            algorithm=settings.ALGORITHM
        )
        return encoded_token
    except Exception as e:
        logger.error(f"Token creation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create access token"
        )

def create_refresh_token(data: Dict[str, Union[str, int, bool]]) -> str:
    """
    Create JWT refresh token with extended expiration.
    
    Args:
        data: Token payload data
        
    Returns:
        str: Encoded refresh token
    """
    token_data = deepcopy(data)
    
    # Calculate expiration time in days
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    # Add refresh token specific claims
    token_data.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "nbf": datetime.utcnow(),
        "jti": str(uuid4()),
        "type": "refresh"
    })
    
    try:
        encoded_token = jwt.encode(
            token_data,
            settings.SECRET_KEY.get_secret_value(),
            algorithm=settings.ALGORITHM
        )
        return encoded_token
    except Exception as e:
        logger.error(f"Refresh token creation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create refresh token"
        )

def verify_token(token: str, token_type: str) -> Dict[str, Union[str, int, bool]]:
    """
    Verify and decode JWT token with enhanced validation.
    
    Args:
        token: JWT token to verify
        token_type: Expected token type ('access' or 'refresh')
        
    Returns:
        dict: Decoded token payload
        
    Raises:
        HTTPException: If token validation fails
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # Decode and verify token
        payload = jwt.decode(
            token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM]
        )
        
        # Verify token type
        if payload.get("type") != token_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token type. Expected {token_type}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify required claims
        required_claims = {"exp", "iat", "nbf", "jti", "type"}
        if not all(claim in payload for claim in required_claims):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing required claims",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return payload
        
    except JWTError as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token verification failed"
        )