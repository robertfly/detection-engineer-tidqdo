# External imports with version tracking
from pydantic import BaseModel, Field, validator, root_validator  # pydantic v2.0+
from uuid import UUID  # python v3.11+
from datetime import datetime  # python v3.11+
from typing import Optional, List, Dict, Any, Union  # python v3.11+

# Internal imports
from ..models.detection import DetectionStatus, DetectionPlatform

class DetectionBase(BaseModel):
    """
    Base Pydantic schema for detection validation with enhanced validation rules.
    Implements core detection data structures with comprehensive field validation.
    """
    name: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Detection rule name"
    )
    description: Optional[str] = Field(
        None,
        max_length=2000,
        description="Detailed description of the detection"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata for the detection"
    )
    logic: Dict[str, Any] = Field(
        ...,
        description="Platform-specific detection logic"
    )
    mitre_mapping: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="MITRE ATT&CK technique mappings"
    )
    status: DetectionStatus = Field(
        default=DetectionStatus.draft,
        description="Current detection status"
    )
    platform: DetectionPlatform = Field(
        ...,
        description="Target detection platform"
    )
    validation_results: Dict[str, Any] = Field(
        default_factory=lambda: {"status": "pending", "errors": []},
        description="Validation results and errors"
    )

    @validator("name")
    def validate_name(cls, value: str) -> str:
        """Enhanced name validation with length and format checks"""
        # Check for reserved keywords
        reserved_keywords = {"select", "from", "where", "insert", "delete", "update"}
        if value.lower() in reserved_keywords:
            raise ValueError(f"Name cannot be a reserved keyword: {value}")

        # Validate name format (alphanumeric with underscores)
        if not all(c.isalnum() or c == '_' for c in value):
            raise ValueError("Name must contain only alphanumeric characters and underscores")

        # Sanitize input
        value = value.strip()

        return value

    @validator("logic")
    def validate_logic(cls, value: Dict[str, Any], values: Dict[str, Any]) -> Dict[str, Any]:
        """Enhanced logic validation with platform-specific checks"""
        required_fields = {"query", "data_model"}
        if not all(field in value for field in required_fields):
            raise ValueError(f"Detection logic must contain fields: {required_fields}")

        # Platform-specific validation
        platform = values.get("platform")
        if platform:
            if platform == DetectionPlatform.sigma:
                if "logsource" not in value:
                    raise ValueError("Sigma detection requires 'logsource' field")
            elif platform == DetectionPlatform.kql:
                if not value["query"].lower().startswith(("let", "search", "union")):
                    raise ValueError("KQL query must start with 'let', 'search', or 'union'")

        return value

    @validator("mitre_mapping")
    def validate_mitre_mapping(cls, value: Dict[str, List[str]]) -> Dict[str, List[str]]:
        """Enhanced MITRE ATT&CK mapping validation"""
        for technique_id, subtechniques in value.items():
            # Validate technique ID format
            if not technique_id.startswith("T") or not technique_id[1:].isdigit():
                raise ValueError(f"Invalid technique ID format: {technique_id}")

            # Validate sub-technique format
            for subtechnique in subtechniques:
                if not subtechnique.startswith(f"{technique_id}.") or not subtechnique.split(".")[1].isdigit():
                    raise ValueError(f"Invalid sub-technique format: {subtechnique}")

        return value

    @root_validator(pre=True)
    def validate_status_transition(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validates detection status transitions"""
        status = values.get("status")
        if status == DetectionStatus.published:
            validation_results = values.get("validation_results", {})
            if validation_results.get("status") != "success":
                raise ValueError("Detection must pass validation before publishing")
        return values

class DetectionCreate(DetectionBase):
    """Schema for creating new detections"""
    creator_id: UUID = Field(..., description="ID of the detection creator")
    library_id: UUID = Field(..., description="ID of the parent detection library")

class DetectionUpdate(DetectionBase):
    """Schema for updating existing detections"""
    pass

class DetectionInDB(DetectionBase):
    """Schema for detection database representation with enhanced tracking"""
    id: UUID = Field(..., description="Unique detection identifier")
    validation_results: Dict[str, Any] = Field(
        default_factory=dict,
        description="Detailed validation results"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    performance_metrics: Dict[str, Any] = Field(
        default_factory=dict,
        description="Detection performance metrics"
    )
    validation_history: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Historical validation results"
    )

    class Config:
        """Pydantic model configuration"""
        orm_mode = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }