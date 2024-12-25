# External imports - versions specified for security tracking
from pydantic import BaseModel, EmailStr, UUID4, Field, validator  # pydantic v2.0+
from pydantic import constr  # pydantic v2.0+
from datetime import datetime
from typing import Optional, List, Dict

# Internal imports
from ..models.user import ROLES  # Import allowed roles from user model

class Token(BaseModel):
    """Enhanced schema for authentication token response with expiration tracking."""
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    access_token_expires: datetime = Field(..., description="Access token expiration timestamp")
    refresh_token_expires: datetime = Field(..., description="Refresh token expiration timestamp")
    token_status: str = Field(default="active", description="Token status for security tracking")

    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
                "token_type": "bearer",
                "access_token_expires": "2024-01-19T11:00:00Z",
                "refresh_token_expires": "2024-01-26T10:00:00Z",
                "token_status": "active"
            }
        }

class TokenPayload(BaseModel):
    """Enhanced schema for JWT token payload with additional security claims."""
    sub: UUID4 = Field(..., description="Subject (user ID)")
    role: str = Field(..., description="User role")
    exp: int = Field(..., description="Token expiration timestamp")
    iss: str = Field(default="detection-platform", description="Token issuer")
    aud: str = Field(default="detection-platform-api", description="Token audience")
    jti: str = Field(..., description="JWT ID for token tracking")
    scopes: List[str] = Field(default_factory=list, description="Token permission scopes")

    class Config:
        json_schema_extra = {
            "example": {
                "sub": "123e4567-e89b-12d3-a456-426614174000",
                "role": "enterprise",
                "exp": 1705665600,
                "iss": "detection-platform",
                "aud": "detection-platform-api",
                "jti": "unique-token-id-123",
                "scopes": ["read:detections", "write:detections"]
            }
        }

class UserLogin(BaseModel):
    """Schema for user login credentials with enhanced validation."""
    email: EmailStr = Field(..., description="User email address")
    password: constr(min_length=8, max_length=100, regex='^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).*$') = \
        Field(..., description="User password")
    remember_me: bool = Field(default=False, description="Extended session flag")
    mfa_token: Optional[Dict] = Field(default=None, description="Multi-factor authentication token")

    @validator('password')
    def validate_password(cls, value: str) -> str:
        """Validates password complexity requirements."""
        # Check minimum complexity requirements
        if not any(c.isupper() for c in value):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one number")
        if not any(not c.isalnum() for c in value):
            raise ValueError("Password must contain at least one special character")
            
        # Check against common password patterns
        common_patterns = ['password', '123456', 'qwerty']
        if any(pattern in value.lower() for pattern in common_patterns):
            raise ValueError("Password contains common patterns")
            
        return value

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "SecureP@ss123",
                "remember_me": False,
                "mfa_token": {"code": "123456"}
            }
        }

class UserRegister(BaseModel):
    """Enhanced schema for user registration with comprehensive validation."""
    email: EmailStr = Field(..., description="User email address")
    name: str = Field(..., min_length=2, max_length=100, description="User full name")
    password: constr(min_length=8, max_length=100, regex='^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).*$') = \
        Field(..., description="User password")
    role: str = Field(default="public", description="User role")
    gdpr_consent: bool = Field(..., description="GDPR consent flag")
    terms_accepted: bool = Field(..., description="Terms acceptance flag")
    registration_source: str = Field(default="web", description="Registration source tracking")

    @validator('role')
    def validate_role(cls, value: str) -> str:
        """Validates user role against allowed roles."""
        if value not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
        return value

    @validator('email')
    def validate_email_domain(cls, value: str) -> str:
        """Additional email validation for security."""
        domain = value.split('@')[1]
        blocked_domains = ['tempmail.com', 'disposable.com']
        if domain in blocked_domains:
            raise ValueError("Email domain not allowed")
        return value

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "name": "John Doe",
                "password": "SecureP@ss123",
                "role": "public",
                "gdpr_consent": True,
                "terms_accepted": True,
                "registration_source": "web"
            }
        }

class UserResponse(BaseModel):
    """Enhanced schema for user data responses with security information."""
    id: UUID4 = Field(..., description="User ID")
    email: EmailStr = Field(..., description="User email address")
    name: str = Field(..., description="User full name")
    role: str = Field(..., description="User role")
    is_active: bool = Field(..., description="Account status")
    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    last_login: Optional[datetime] = Field(None, description="Last login timestamp")
    last_password_change: Optional[datetime] = Field(None, description="Last password change timestamp")
    mfa_enabled: bool = Field(default=False, description="MFA status")
    security_groups: List[str] = Field(default_factory=list, description="Security group memberships")
    permissions: Dict = Field(default_factory=dict, description="User permissions")
    account_status: str = Field(default="active", description="Detailed account status")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "email": "user@example.com",
                "name": "John Doe",
                "role": "enterprise",
                "is_active": True,
                "created_at": "2024-01-19T10:00:00Z",
                "updated_at": "2024-01-19T10:00:00Z",
                "last_login": "2024-01-19T10:00:00Z",
                "last_password_change": "2024-01-19T10:00:00Z",
                "mfa_enabled": True,
                "security_groups": ["detection_engineers"],
                "permissions": {"can_create_detections": True},
                "account_status": "active"
            }
        }