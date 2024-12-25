# External imports - versions specified for security tracking
from pydantic import BaseModel, Field, validator, root_validator  # pydantic v2.0+
from uuid import UUID  # python v3.11+
from datetime import datetime  # python v3.11+
from typing import Optional, List, Dict, Any, Literal  # python v3.11+

# Internal imports
from ..models.library import LibraryVisibility

class LibraryBase(BaseModel):
    """
    Base Pydantic schema for library validation with enhanced security controls.
    Implements comprehensive validation for library attributes with strict security checks.
    """
    name: str = Field(
        ...,  # Required field
        min_length=3,
        max_length=100,
        description="Library name with length between 3-100 characters"
    )
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional library description"
    )
    visibility: LibraryVisibility = Field(
        default=LibraryVisibility.private,
        description="Library visibility level controlling access"
    )
    settings: Dict[str, Any] = Field(
        default_factory=lambda: {
            "default_platform": "sigma",
            "auto_validate": True,
            "require_mitre_mapping": True,
            "allow_community_contributions": False
        },
        description="Library configuration settings"
    )

    @validator("name")
    def validate_name(cls, name: str) -> str:
        """
        Validates library name format with enhanced security checks.
        
        Args:
            name: Library name to validate
            
        Returns:
            str: Validated library name
            
        Raises:
            ValueError: If name fails validation
        """
        # Strip whitespace
        name = name.strip()
        
        # Check length after stripping
        if len(name) < 3 or len(name) > 100:
            raise ValueError("Library name must be between 3 and 100 characters")
            
        # Validate characters (alphanumeric, spaces, hyphens)
        if not all(c.isalnum() or c in " -" for c in name):
            raise ValueError(
                "Library name can only contain letters, numbers, spaces and hyphens"
            )
            
        # Check for malicious patterns
        malicious_patterns = ["<script>", "javascript:", "data:"]
        if any(pattern in name.lower() for pattern in malicious_patterns):
            raise ValueError("Library name contains invalid patterns")
            
        return name

    @validator("settings")
    def validate_settings(cls, settings: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates library settings with security controls.
        
        Args:
            settings: Settings dictionary to validate
            
        Returns:
            Dict[str, Any]: Validated settings
            
        Raises:
            ValueError: If settings fail validation
        """
        # Required settings keys
        required_keys = {
            "default_platform",
            "auto_validate",
            "require_mitre_mapping",
            "allow_community_contributions"
        }
        
        # Validate required keys
        if not all(key in settings for key in required_keys):
            raise ValueError(f"Settings must contain all required keys: {required_keys}")
            
        # Validate default_platform
        valid_platforms = {"sigma", "kql", "spl", "yara-l"}
        if settings["default_platform"] not in valid_platforms:
            raise ValueError(f"Invalid default_platform. Must be one of: {valid_platforms}")
            
        # Validate boolean settings
        bool_settings = {"auto_validate", "require_mitre_mapping", "allow_community_contributions"}
        for key in bool_settings:
            if not isinstance(settings[key], bool):
                raise ValueError(f"Setting '{key}' must be a boolean value")
                
        return settings

    @root_validator
    def validate_visibility(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates visibility settings against organization policy.
        
        Args:
            values: Dictionary of field values
            
        Returns:
            Dict[str, Any]: Validated values
            
        Raises:
            ValueError: If visibility validation fails
        """
        visibility = values.get("visibility")
        settings = values.get("settings", {})
        
        # Validate public visibility
        if visibility == LibraryVisibility.public:
            if not settings.get("allow_community_contributions", False):
                raise ValueError(
                    "Public libraries must allow community contributions"
                )
                
        # Validate organization visibility
        elif visibility == LibraryVisibility.organization:
            if settings.get("allow_community_contributions", False):
                raise ValueError(
                    "Organization libraries cannot allow community contributions"
                )
                
        return values

    class Config:
        """Pydantic model configuration"""
        use_enum_values = True
        validate_assignment = True
        extra = "forbid"
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }

class LibraryCreate(LibraryBase):
    """Schema for creating new libraries with organization validation."""
    organization_id: UUID = Field(
        ...,
        description="UUID of the parent organization"
    )

class LibraryUpdate(LibraryBase):
    """Schema for updating existing libraries with change validation."""
    pass

class LibraryInDB(LibraryBase):
    """Schema for library database representation with audit fields."""
    id: UUID = Field(..., description="Library unique identifier")
    detection_ids: List[UUID] = Field(
        default_factory=list,
        description="List of associated detection IDs"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    created_by: UUID = Field(..., description="Creator user ID")
    updated_by: UUID = Field(..., description="Last updater user ID")

    class Config:
        """Additional configuration for database schema"""
        orm_mode = True
        validate_assignment = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }