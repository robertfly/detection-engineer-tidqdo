"""
User management API endpoints with enhanced security controls, comprehensive audit logging,
and role-based access control. Implements strict data privacy compliance and optimized 
query performance.

Version: 1.0.0
"""

# External imports - versions specified for security tracking
from fastapi import APIRouter, Depends, HTTPException, Query, status  # fastapi v0.104+
from fastapi_cache import CacheControl  # fastapi-cache v0.1.0+
from fastapi_cache.decorator import cache  # fastapi-cache v0.1.0+
from slowapi import Limiter  # slowapi v0.1.0+
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
from datetime import datetime

# Internal imports
from ....models.user import User
from ....utils.security import SecurityHeaders, verify_secure_token
from ....core.security import create_access_token
from ....db.session import get_db
from ....core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Initialize router with security headers
router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(SecurityHeaders.apply_security_headers)]
)

# Response models
from pydantic import BaseModel, EmailStr, UUID4
from typing import Optional

class UserResponse(BaseModel):
    """Secure user response model with minimal data exposure"""
    id: UUID4
    email: EmailStr
    role: str
    last_login: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True

@router.get(
    "/",
    response_model=List[UserResponse],
    status_code=status.HTTP_200_OK,
    description="Get paginated list of users with role-based access control"
)
@limiter.limit("100/minute")
@cache(expire=300)  # Cache for 5 minutes
async def get_users(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    role_filter: Optional[str] = Query(None, regex="^(public|community|enterprise|admin)$")
) -> List[UserResponse]:
    """
    Retrieve paginated list of users with enhanced security controls and performance optimization.
    
    Args:
        db: Database session
        skip: Number of records to skip
        limit: Maximum number of records to return
        current_user: Authenticated user making the request
        role_filter: Optional role-based filtering
        
    Returns:
        List[UserResponse]: Paginated list of users with minimal data exposure
        
    Raises:
        HTTPException: For unauthorized access or invalid parameters
    """
    try:
        # Verify user has required permissions
        if current_user.role not in ["admin", "enterprise"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to list users"
            )

        # Build optimized query with security filters
        query = db.query(User)
        
        # Apply role-based filtering
        if role_filter:
            if current_user.role != "admin" and role_filter == "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot filter admin users"
                )
            query = query.filter(User.role == role_filter)
            
        # Apply enterprise isolation for non-admin users
        if current_user.role != "admin":
            query = query.filter(User.role != "admin")

        # Execute paginated query with optimized loading
        users = (
            query
            .order_by(User.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

        # Log successful access
        logger.info(
            "Users retrieved successfully",
            extra={
                "user_id": str(current_user.id),
                "role": current_user.role,
                "count": len(users)
            }
        )

        return [
            UserResponse(
                id=user.id,
                email=user.email,
                role=user.role,
                last_login=user.last_login,
                is_active=user.is_active
            ) for user in users
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error retrieving users: {str(e)}",
            extra={"user_id": str(current_user.id)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving users"
        )

async def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    Validate current user from JWT token with enhanced security checks.
    
    Args:
        db: Database session
        token: JWT access token
        
    Returns:
        User: Authenticated user object
        
    Raises:
        HTTPException: For invalid or expired tokens
    """
    try:
        # Verify token with security context
        payload = verify_secure_token(token, {
            "token_type": "access",
            "security_level": "standard"
        })
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )

        # Get user with optimized query
        user = (
            db.query(User)
            .filter(User.id == user_id)
            .filter(User.is_active == True)
            .first()
        )
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )

        return user

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )