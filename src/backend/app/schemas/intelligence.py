# External imports - versions specified for security tracking
from pydantic import BaseModel, Field, validator  # pydantic v2.0.0
from typing import Optional, Dict, Any, List  # python v3.11
from uuid import UUID  # python v3.11
from datetime import datetime  # python v3.11

# Internal imports
from ..models.intelligence import IntelligenceSourceType, IntelligenceStatus

# Constants for validation
MIN_NAME_LENGTH = 3
MAX_NAME_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 1000
MIN_ACCURACY = 0.0
MAX_ACCURACY = 1.0

class IntelligenceBase(BaseModel):
    """
    Base Pydantic model for intelligence data validation with enhanced source validation.
    Implements core validation rules for intelligence processing requirements.
    """
    name: str = Field(
        min_length=MIN_NAME_LENGTH,
        max_length=MAX_NAME_LENGTH,
        description="Name of the intelligence entry"
    )
    description: Optional[str] = Field(
        None,
        max_length=MAX_DESCRIPTION_LENGTH,
        description="Detailed description of the intelligence"
    )
    source_type: IntelligenceSourceType = Field(
        description="Type of intelligence source"
    )
    source_url: Optional[str] = Field(
        None,
        max_length=2048,
        description="URL for web-based intelligence sources"
    )
    source_content: Optional[str] = Field(
        None,
        description="Raw content for text-based intelligence"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional metadata for the intelligence"
    )
    tags: Optional[List[str]] = Field(
        default_factory=list,
        description="Tags for categorizing intelligence"
    )
    source_config: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Source-specific configuration parameters"
    )

    @validator("source_config")
    def validate_source(cls, values: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """
        Validates source configuration based on source type with enhanced validation rules.
        
        Args:
            values: Source configuration dictionary
            
        Returns:
            Dict[str, Any]: Validated source configuration
            
        Raises:
            ValueError: If configuration is invalid for source type
        """
        if not values:
            return values

        source_type = kwargs["values"].get("source_type")
        if not source_type:
            return values

        # Validate URL sources
        if source_type == IntelligenceSourceType.url:
            if not values.get("max_depth"):
                values["max_depth"] = 1
            if not values.get("timeout_seconds"):
                values["timeout_seconds"] = 30

        # Validate PDF sources
        elif source_type == IntelligenceSourceType.pdf:
            if not values.get("ocr_enabled"):
                values["ocr_enabled"] = True
            if not values.get("max_pages"):
                values["max_pages"] = 100
            if values.get("max_file_size_mb", 0) > 50:
                raise ValueError("PDF file size cannot exceed 50MB")

        # Validate image sources
        elif source_type == IntelligenceSourceType.image:
            if not values.get("min_resolution"):
                values["min_resolution"] = [800, 600]
            if not values.get("max_file_size_mb"):
                values["max_file_size_mb"] = 10

        return values

class IntelligenceCreate(IntelligenceBase):
    """
    Pydantic model for intelligence creation requests with enhanced validation.
    Implements additional validation for creation-specific requirements.
    """
    creator_id: UUID = Field(description="ID of the intelligence creator")
    organization_id: Optional[UUID] = Field(
        None,
        description="ID of the associated organization"
    )
    labels: Optional[List[str]] = Field(
        default_factory=list,
        description="Classification labels"
    )
    is_confidential: Optional[bool] = Field(
        False,
        description="Flag for confidential intelligence"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "name": "APT29 Campaign Report",
                "description": "Detailed analysis of recent APT29 activities",
                "source_type": "pdf",
                "source_url": "https://example.com/report.pdf",
                "creator_id": "123e4567-e89b-12d3-a456-426614174000",
                "labels": ["APT29", "Russia", "Campaign"],
                "is_confidential": True
            }
        }

class IntelligenceProcessingUpdate(BaseModel):
    """
    Enhanced Pydantic model for intelligence processing status updates with accuracy tracking.
    Implements comprehensive validation for processing metrics and results.
    """
    status: IntelligenceStatus = Field(description="Current processing status")
    processing_results: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Results from intelligence processing"
    )
    processing_accuracy: float = Field(
        ge=MIN_ACCURACY,
        le=MAX_ACCURACY,
        description="Processing accuracy score"
    )
    processing_steps: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list,
        description="Detailed processing steps"
    )
    confidence_scores: Optional[Dict[str, float]] = Field(
        default_factory=dict,
        description="Confidence scores for extracted data"
    )
    error_details: Optional[Dict[str, str]] = Field(
        default_factory=dict,
        description="Details of any processing errors"
    )

    @validator("processing_accuracy")
    def validate_accuracy(cls, value: float) -> float:
        """
        Validates processing accuracy within acceptable range and thresholds.
        
        Args:
            value: Accuracy value to validate
            
        Returns:
            float: Validated accuracy value
            
        Raises:
            ValueError: If accuracy is outside acceptable range
        """
        if not MIN_ACCURACY <= value <= MAX_ACCURACY:
            raise ValueError(f"Accuracy must be between {MIN_ACCURACY} and {MAX_ACCURACY}")
        return value

class IntelligenceInDB(IntelligenceBase):
    """
    Enhanced Pydantic model for intelligence database representation with comprehensive tracking.
    Implements full database schema validation with audit trail support.
    """
    id: UUID = Field(description="Unique intelligence identifier")
    status: IntelligenceStatus = Field(description="Current intelligence status")
    processing_results: Dict[str, Any] = Field(
        default_factory=dict,
        description="Processing results and extracted data"
    )
    processing_accuracy: float = Field(
        ge=MIN_ACCURACY,
        le=MAX_ACCURACY,
        description="Overall processing accuracy"
    )
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    processed_at: Optional[datetime] = Field(
        None,
        description="Processing completion timestamp"
    )
    status_history: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list,
        description="Status change history"
    )
    audit_trail: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Audit trail for changes"
    )

    class Config:
        orm_mode = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }