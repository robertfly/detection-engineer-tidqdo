"""
Package initializer for Pydantic schema models that centralizes and exposes all data validation schemas.
Provides comprehensive type validation, serialization, and API documentation support.

Version: 1.0.0
"""

# External imports with version tracking
from typing import List

# Internal imports for schema models
from .user import (  # pydantic v2.0.0+
    UserBase,
    UserCreate, 
    UserUpdate,
    UserInDB,
    UserResponse
)

from .detection import (  # pydantic v2.0.0+
    DetectionBase,
    DetectionCreate,
    DetectionUpdate,
    DetectionInDB
)

from .intelligence import (  # pydantic v2.0.0+
    IntelligenceBase,
    IntelligenceCreate,
    IntelligenceUpdate,
    IntelligenceInDB,
    IntelligenceProcessingUpdate
)

# Package version
__version__ = "1.0.0"

# Export all schema models
__all__: List[str] = [
    # User schemas
    "UserBase",
    "UserCreate", 
    "UserUpdate",
    "UserInDB",
    "UserResponse",
    
    # Detection schemas
    "DetectionBase",
    "DetectionCreate",
    "DetectionUpdate", 
    "DetectionInDB",
    
    # Intelligence schemas
    "IntelligenceBase",
    "IntelligenceCreate",
    "IntelligenceUpdate",
    "IntelligenceInDB",
    "IntelligenceProcessingUpdate"
]

# Schema model documentation
SCHEMA_DESCRIPTIONS = {
    # User schema descriptions
    "UserBase": "Base user schema defining core user attributes",
    "UserCreate": "User creation schema with password field",
    "UserUpdate": "User update schema for modifiable fields",
    "UserInDB": "Database user schema with internal fields",
    "UserResponse": "User response schema for API endpoints",
    
    # Detection schema descriptions  
    "DetectionBase": "Base detection schema with UDF support",
    "DetectionCreate": "Detection creation schema with library assignment",
    "DetectionUpdate": "Detection update schema for modifications",
    "DetectionInDB": "Database detection schema with tracking fields",
    
    # Intelligence schema descriptions
    "IntelligenceBase": "Base intelligence schema for source tracking",
    "IntelligenceCreate": "Intelligence creation schema with source metadata",
    "IntelligenceUpdate": "Intelligence update schema for processing updates", 
    "IntelligenceInDB": "Database intelligence schema with processing status",
    "IntelligenceProcessingUpdate": "Schema for intelligence processing status updates"
}

# The schemas package provides:
# 1. Centralized schema validation through Pydantic models
# 2. Standardized API request/response formats
# 3. Universal Detection Format (UDF) validation
# 4. Intelligence processing data validation
# 5. Comprehensive type safety and validation rules