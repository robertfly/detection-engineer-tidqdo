"""
Organization schema module implementing secure data validation and serialization
with enhanced security features for data classification, GDPR compliance, and audit logging.

Version: 1.0.0
"""

# External imports - versions specified for security tracking
from pydantic import BaseModel, Field, UUID4, constr  # pydantic v2.0.0+
from typing import Optional, Dict
from datetime import datetime
from enum import Enum

# Internal imports
from ..models.organization import ORGANIZATION_TYPES
from ..core.security import SecurityClassification

# Global constants for data security
SENSITIVE_FIELDS = ["domain", "settings", "gdpr_settings"]
MAX_NAME_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 500

class OrganizationBase(BaseModel):
    """
    Base schema with common organization attributes and enhanced security features.
    Implements comprehensive validation and data classification.
    """
    name: constr(min_length=3, max_length=MAX_NAME_LENGTH) = Field(
        ...,
        description="Organization name with length validation",
        example="Enterprise Security Team"
    )
    description: Optional[constr(max_length=MAX_DESCRIPTION_LENGTH)] = Field(
        None,
        description="Optional organization description"
    )
    type: str = Field(
        ...,
        description="Organization type (enterprise/community)"
    )
    domain: Optional[str] = Field(
        None,
        description="Organization domain for enterprise accounts",
        pattern=r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
    )
    settings: Optional[Dict] = Field(
        None,
        description="Organization settings with security controls"
    )
    data_classification: SecurityClassification = Field(
        default=SecurityClassification.internal,
        description="Data classification level for security controls"
    )
    gdpr_settings: Optional[Dict] = Field(
        None,
        description="GDPR compliance settings"
    )
    audit_config: Optional[Dict] = Field(
        None,
        description="Audit logging configuration"
    )

    class Config:
        """Pydantic model configuration"""
        str_strip_whitespace = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID4: lambda v: str(v)
        }

    @classmethod
    def validate_type(cls, type_value: str) -> bool:
        """
        Validate organization type with enhanced security checks.

        Args:
            type_value: Organization type to validate

        Returns:
            bool: True if valid type

        Raises:
            ValueError: If type is invalid
        """
        if type_value not in ORGANIZATION_TYPES:
            raise ValueError(f"Invalid organization type. Must be one of: {ORGANIZATION_TYPES}")
        return True

    @classmethod
    def validate_classification(cls, classification: SecurityClassification) -> bool:
        """
        Validate data classification level and required security controls.

        Args:
            classification: Security classification level

        Returns:
            bool: True if valid classification

        Raises:
            ValueError: If classification is invalid
        """
        if not isinstance(classification, SecurityClassification):
            raise ValueError("Invalid security classification")
        return True

class OrganizationCreate(OrganizationBase):
    """
    Schema for organization creation with enhanced security validations.
    Implements strict validation for creation-specific fields.
    """
    name: constr(min_length=3, max_length=MAX_NAME_LENGTH) = Field(
        ...,
        description="Organization name (required)"
    )
    description: constr(max_length=MAX_DESCRIPTION_LENGTH) = Field(
        ...,
        description="Organization description (required for creation)"
    )
    data_classification: SecurityClassification = Field(
        ...,
        description="Required security classification"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Enterprise Security Team",
                "description": "Primary security operations team",
                "type": "enterprise",
                "domain": "enterprise.com",
                "data_classification": "confidential"
            }
        }

class OrganizationUpdate(BaseModel):
    """
    Schema for organization updates with security controls.
    Implements partial update validation with security checks.
    """
    name: Optional[constr(min_length=3, max_length=MAX_NAME_LENGTH)] = None
    description: Optional[constr(max_length=MAX_DESCRIPTION_LENGTH)] = None
    settings: Optional[Dict] = None
    data_classification: Optional[SecurityClassification] = None
    gdpr_settings: Optional[Dict] = None

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Updated Team Name",
                "data_classification": "restricted"
            }
        }

class OrganizationInDB(OrganizationBase):
    """
    Schema for organization data from database with security metadata.
    Includes audit trail and security tracking fields.
    """
    id: UUID4 = Field(..., description="Organization unique identifier")
    is_active: bool = Field(default=True, description="Organization active status")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    security_metadata: Dict = Field(
        default_factory=dict,
        description="Security-related metadata"
    )
    audit_trail: Dict = Field(
        default_factory=dict,
        description="Audit logging information"
    )

class OrganizationResponse(BaseModel):
    """
    Schema for organization data in API responses with masked sensitive data.
    Implements data masking based on classification level.
    """
    id: UUID4
    name: str
    type: str
    is_active: bool
    created_at: datetime
    data_classification: SecurityClassification
    masked_fields: Dict = Field(
        default_factory=lambda: {"sensitive_fields": SENSITIVE_FIELDS},
        description="Information about masked sensitive fields"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "name": "Enterprise Security Team",
                "type": "enterprise",
                "is_active": True,
                "created_at": "2024-01-19T10:00:00Z",
                "data_classification": "confidential",
                "masked_fields": {
                    "sensitive_fields": ["domain", "settings", "gdpr_settings"]
                }
            }
        }

# Export schemas for use in API layer
__all__ = [
    "OrganizationBase",
    "OrganizationCreate",
    "OrganizationUpdate",
    "OrganizationInDB",
    "OrganizationResponse"
]