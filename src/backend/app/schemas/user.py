# External imports with version tracking
from pydantic import BaseModel, EmailStr, Field, UUID4, SecretStr, validator, constr  # pydantic v2.0.0+
from typing import Optional, List, Dict
from datetime import datetime
import re

# Internal imports
from ..models.user import User

# Constants for validation
ROLE_CHOICES = ['public', 'community', 'enterprise', 'admin']
PASSWORD_MIN_LENGTH = 12
PASSWORD_HISTORY_SIZE = 5
GDPR_PURPOSES = ['analytics', 'marketing', 'essential']

# Password complexity regex pattern
PASSWORD_PATTERN = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$'
)

class UserBase(BaseModel):
    """Base schema with common user attributes and GDPR compliance fields."""
    email: EmailStr = Field(..., description="User's email address")
    name: str = Field(..., min_length=2, max_length=100, description="User's full name")
    role: str = Field(..., description="User's role in the system")
    preferences: Dict = Field(default_factory=dict, description="User preferences")
    gdpr_consent: bool = Field(default=False, description="GDPR consent status")
    consent_timestamp: Optional[datetime] = Field(None, description="Timestamp of GDPR consent")
    consented_purposes: List[str] = Field(
        default_factory=list,
        description="List of consented data processing purposes"
    )

    @validator('role')
    def validate_role(cls, v):
        """Validate user role against allowed choices."""
        if v not in ROLE_CHOICES:
            raise ValueError(f"Role must be one of: {', '.join(ROLE_CHOICES)}")
        return v

    @validator('consented_purposes')
    def validate_consented_purposes(cls, v):
        """Validate GDPR consent purposes."""
        for purpose in v:
            if purpose not in GDPR_PURPOSES:
                raise ValueError(f"Invalid consent purpose. Must be one of: {', '.join(GDPR_PURPOSES)}")
        return v

    class Config:
        """Pydantic configuration for enhanced security."""
        extra = "forbid"  # Prevent additional fields
        validate_assignment = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class UserCreate(UserBase):
    """Schema for user creation with enhanced password validation."""
    password: SecretStr = Field(
        ...,
        min_length=PASSWORD_MIN_LENGTH,
        description="User password with security requirements"
    )
    password_confirm: SecretStr = Field(
        ...,
        description="Password confirmation for validation"
    )
    terms_accepted: bool = Field(
        ...,
        description="Acceptance of terms and conditions"
    )

    @validator('password')
    def validate_password_strength(cls, v):
        """Enhanced password validation with security rules."""
        password = v.get_secret_value()
        if not PASSWORD_PATTERN.match(password):
            raise ValueError(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, one number, and one special character"
            )
        return v

    @validator('password_confirm')
    def passwords_match(cls, v, values):
        """Ensure password confirmation matches."""
        if 'password' in values and v.get_secret_value() != values['password'].get_secret_value():
            raise ValueError("Passwords do not match")
        return v

    @validator('terms_accepted')
    def validate_terms_acceptance(cls, v):
        """Ensure terms are accepted."""
        if not v:
            raise ValueError("Terms and conditions must be accepted")
        return v

class UserUpdate(BaseModel):
    """Schema for user updates with optional fields and validation."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    preferences: Optional[Dict] = None
    current_password: Optional[SecretStr] = None
    new_password: Optional[SecretStr] = Field(None, min_length=PASSWORD_MIN_LENGTH)

    @validator('new_password')
    def validate_new_password(cls, v, values):
        """Validate new password when provided."""
        if v is not None:
            if 'current_password' not in values or not values['current_password']:
                raise ValueError("Current password is required to set new password")
            password = v.get_secret_value()
            if not PASSWORD_PATTERN.match(password):
                raise ValueError(
                    "New password must contain at least one uppercase letter, "
                    "one lowercase letter, one number, and one special character"
                )
        return v

class UserInDB(UserBase):
    """Schema for user data in database with encryption and audit fields."""
    id: UUID4
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime]
    password_history: List[str] = Field(default_factory=list)
    security_audit_log: Dict = Field(default_factory=dict)

    class Config:
        """Configuration for database schema."""
        orm_mode = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID4: lambda v: str(v)
        }

class UserResponse(BaseModel):
    """Schema for API responses with data minimization."""
    id: UUID4
    email: EmailStr
    name: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        """Configuration for response schema."""
        orm_mode = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID4: lambda v: str(v)
        }

# Export schemas
__all__ = [
    'UserBase',
    'UserCreate',
    'UserUpdate',
    'UserInDB',
    'UserResponse'
]