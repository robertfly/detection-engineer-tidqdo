# External imports - versions specified for security tracking
from pydantic import BaseModel, Field, validator, root_validator  # pydantic v2.0+
from uuid import UUID, uuid4  # python v3.11+
from datetime import datetime  # python v3.11+
from typing import Optional, List, Dict, Any, Literal  # python v3.11+
import re

# Internal imports
from ..models.coverage import CoverageType

# Global constants for validation
MITRE_ID_PATTERN = re.compile(r'^(T|TA)\d{4}(\.\d{3})?$')
COVERAGE_PERCENTAGE_MIN = 0.0
COVERAGE_PERCENTAGE_MAX = 100.0

class CoverageBase(BaseModel):
    """
    Base Pydantic model for coverage data validation with enhanced security controls.
    Implements comprehensive validation for MITRE ATT&CK coverage tracking.
    """
    mitre_id: str = Field(
        ...,  # Required field
        description="MITRE ATT&CK technique or tactic ID",
        example="T1055.001",
        min_length=4,
        max_length=11
    )
    
    name: str = Field(
        ...,
        description="Human-readable name of the technique or tactic",
        example="Process Injection: Dynamic-link Library Injection",
        min_length=1,
        max_length=255
    )
    
    type: CoverageType = Field(
        ...,
        description="Type of coverage (technique or tactic)",
        example=CoverageType.TECHNIQUE
    )
    
    coverage_percentage: float = Field(
        default=0.0,
        description="Percentage of coverage for this technique/tactic",
        ge=COVERAGE_PERCENTAGE_MIN,
        le=COVERAGE_PERCENTAGE_MAX
    )
    
    detection_count: int = Field(
        default=0,
        description="Number of detections mapped to this technique/tactic",
        ge=0
    )
    
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata for coverage tracking"
    )

    @validator('mitre_id')
    def validate_mitre_id(cls, value: str) -> str:
        """
        Validates MITRE ATT&CK technique/tactic ID format with strict pattern matching.
        
        Args:
            value: MITRE ID to validate
            
        Returns:
            str: Validated MITRE ID
            
        Raises:
            ValueError: If ID format is invalid
        """
        # Sanitize input
        value = value.strip().upper()
        
        # Validate pattern
        if not MITRE_ID_PATTERN.match(value):
            raise ValueError(
                "Invalid MITRE ATT&CK ID format. Must be T#### or T####.### for techniques, "
                "or TA#### for tactics"
            )
        
        # Additional validation based on type prefix
        if value.startswith('T') and len(value) < 5:
            raise ValueError("Technique ID must be at least 5 characters")
        if value.startswith('TA') and len(value) != 6:
            raise ValueError("Tactic ID must be exactly 6 characters")
            
        return value

    @validator('coverage_percentage')
    def validate_coverage_percentage(cls, value: float) -> float:
        """
        Validates coverage percentage within acceptable range.
        
        Args:
            value: Coverage percentage to validate
            
        Returns:
            float: Validated and rounded coverage percentage
            
        Raises:
            ValueError: If percentage is out of valid range
        """
        if not COVERAGE_PERCENTAGE_MIN <= value <= COVERAGE_PERCENTAGE_MAX:
            raise ValueError(
                f"Coverage percentage must be between {COVERAGE_PERCENTAGE_MIN} "
                f"and {COVERAGE_PERCENTAGE_MAX}"
            )
        return round(value, 2)

    @root_validator(pre=True)
    def validate_metadata_structure(cls, values: Dict) -> Dict:
        """
        Validates metadata structure and ensures required fields.
        
        Args:
            values: Dictionary of model fields
            
        Returns:
            Dict: Validated values dictionary
        """
        metadata = values.get('metadata', {})
        
        # Ensure metadata is a dictionary
        if not isinstance(metadata, dict):
            raise ValueError("Metadata must be a dictionary")
            
        # Add required metadata fields if missing
        metadata.setdefault('last_updated', datetime.utcnow().isoformat())
        metadata.setdefault('data_sources', [])
        metadata.setdefault('confidence_score', 0.0)
        
        values['metadata'] = metadata
        return values

class CoverageCreate(CoverageBase):
    """Schema for creating new coverage entries with organization context."""
    organization_id: UUID = Field(
        ...,
        description="UUID of the organization owning this coverage entry"
    )

class CoverageUpdate(BaseModel):
    """Schema for partial updates to coverage entries."""
    coverage_percentage: Optional[float] = Field(
        None,
        description="Updated coverage percentage",
        ge=COVERAGE_PERCENTAGE_MIN,
        le=COVERAGE_PERCENTAGE_MAX
    )
    
    detection_count: Optional[int] = Field(
        None,
        description="Updated detection count",
        ge=0
    )
    
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Updated metadata dictionary"
    )

class CoverageResponse(CoverageBase):
    """Enhanced schema for coverage API responses with relationship data."""
    id: UUID = Field(
        default_factory=uuid4,
        description="Unique identifier for the coverage entry"
    )
    
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of coverage entry creation"
    )
    
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of last coverage update"
    )
    
    detection_mappings: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of mapped detection relationships"
    )
    
    gap_analysis: Dict[str, Any] = Field(
        default_factory=dict,
        description="Coverage gap analysis results"
    )

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }
        schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "mitre_id": "T1055.001",
                "name": "Process Injection: Dynamic-link Library Injection",
                "type": "technique",
                "coverage_percentage": 85.5,
                "detection_count": 3,
                "metadata": {
                    "last_updated": "2024-01-19T10:00:00Z",
                    "data_sources": ["process_creation", "module_load"],
                    "confidence_score": 0.85
                },
                "created_at": "2024-01-19T10:00:00Z",
                "updated_at": "2024-01-19T10:00:00Z",
                "detection_mappings": [
                    {
                        "detection_id": "456e4567-e89b-12d3-a456-426614174000",
                        "quality_score": 0.9,
                        "platform": "sigma"
                    }
                ],
                "gap_analysis": {
                    "missing_data_sources": ["file_event"],
                    "coverage_gaps": ["evasion_techniques"]
                }
            }
        }