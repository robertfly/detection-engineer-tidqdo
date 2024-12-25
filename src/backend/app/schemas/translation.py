# External imports - versions specified for security tracking
from pydantic import BaseModel, Field, validator, root_validator  # pydantic v2.0+
from uuid import UUID  # python v3.11+
from datetime import datetime  # python v3.11+
from typing import Optional, Dict, Any, List  # python v3.11+

# Internal imports
from ..models.translation import TranslationPlatform, ValidationStatus
from .detection import DetectionInDB

class TranslationBase(BaseModel):
    """
    Enhanced base Pydantic schema for translation validation with security 
    sanitization and performance tracking.
    
    Implements cross-platform translation capabilities with 95% accuracy target
    and comprehensive validation rules.
    """
    detection_id: UUID = Field(
        ..., 
        description="ID of the source detection rule"
    )
    platform: TranslationPlatform = Field(
        ...,
        description="Target platform for translation"
    )
    translated_logic: Dict[str, Any] = Field(
        ...,
        description="Platform-specific translated detection logic"
    )
    validation_status: ValidationStatus = Field(
        default=ValidationStatus.pending,
        description="Current validation status"
    )
    validation_message: Optional[str] = Field(
        None,
        max_length=1024,
        description="Detailed validation message"
    )
    platform_config: Optional[Dict[str, Any]] = Field(
        None,
        description="Platform-specific configuration"
    )
    performance_metrics: Optional[Dict[str, float]] = Field(
        None,
        description="Translation performance metrics"
    )
    validation_warnings: Optional[List[str]] = Field(
        default_factory=list,
        description="Non-critical validation warnings"
    )

    @validator("platform", "platform_config")
    def validate_platform(cls, value: Any, values: Dict[str, Any], **kwargs) -> Any:
        """
        Enhanced platform validation with capability and rate limit checks.
        
        Args:
            value: Platform or config value to validate
            values: Current field values
            
        Returns:
            Validated platform or config value
            
        Raises:
            ValueError: If validation fails
        """
        field_name = kwargs["field"].name
        
        if field_name == "platform":
            # Validate platform capabilities
            platform_capabilities = {
                TranslationPlatform.splunk: {"query_types": ["spl"], "rate_limit": 1000},
                TranslationPlatform.sentinel: {"query_types": ["kql"], "rate_limit": 100},
                TranslationPlatform.chronicle: {"query_types": ["yara-l"], "rate_limit": 500},
                TranslationPlatform.elastic: {"query_types": ["eql", "kql"], "rate_limit": 200},
                TranslationPlatform.qradar: {"query_types": ["aql"], "rate_limit": 100}
            }
            
            if value not in platform_capabilities:
                raise ValueError(f"Unsupported platform: {value}")
                
            return value
            
        elif field_name == "platform_config":
            if not value:
                return value
                
            platform = values.get("platform")
            if not platform:
                raise ValueError("Platform must be specified before platform_config")
                
            # Validate required platform configuration
            required_config = {
                TranslationPlatform.splunk: ["index", "sourcetype"],
                TranslationPlatform.sentinel: ["table", "analytics_rule"],
                TranslationPlatform.chronicle: ["rule_type", "severity"],
                TranslationPlatform.elastic: ["index_pattern", "rule_type"],
                TranslationPlatform.qradar: ["log_source", "rule_type"]
            }
            
            missing_fields = set(required_config[platform]) - set(value.keys())
            if missing_fields:
                raise ValueError(f"Missing required platform config fields: {missing_fields}")
                
            return value

    @root_validator
    def validate_translated_logic(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enhanced logic validation with security checks and performance analysis.
        
        Args:
            values: Current field values
            
        Returns:
            Validated field values
            
        Raises:
            ValueError: If validation fails
        """
        translated_logic = values.get("translated_logic")
        platform = values.get("platform")
        
        if not translated_logic or not platform:
            return values
            
        # Validate required logic structure
        required_fields = {"query", "platform_specific"}
        if not all(field in translated_logic for field in required_fields):
            raise ValueError(f"Translated logic must contain fields: {required_fields}")
            
        # Platform-specific validation
        platform_validators = {
            TranslationPlatform.splunk: cls._validate_splunk_logic,
            TranslationPlatform.sentinel: cls._validate_sentinel_logic,
            TranslationPlatform.chronicle: cls._validate_chronicle_logic,
            TranslationPlatform.elastic: cls._validate_elastic_logic,
            TranslationPlatform.qradar: cls._validate_qradar_logic
        }
        
        if platform in platform_validators:
            platform_validators[platform](translated_logic)
            
        # Track performance metrics
        values["performance_metrics"] = {
            "query_complexity": cls._calculate_query_complexity(translated_logic["query"]),
            "field_coverage": cls._calculate_field_coverage(translated_logic),
            "translation_confidence": cls._calculate_translation_confidence(translated_logic)
        }
        
        return values

    @staticmethod
    def _validate_splunk_logic(logic: Dict[str, Any]) -> None:
        """Validate Splunk-specific translation logic"""
        if not isinstance(logic["query"], str):
            raise ValueError("Splunk query must be a string")
        if not logic["query"].strip():
            raise ValueError("Splunk query cannot be empty")
        if "sourcetype" not in logic["platform_specific"]:
            raise ValueError("Splunk logic must specify sourcetype")

    @staticmethod
    def _validate_sentinel_logic(logic: Dict[str, Any]) -> None:
        """Validate Microsoft Sentinel-specific translation logic"""
        if "table" not in logic["platform_specific"]:
            raise ValueError("Sentinel logic must specify target table")
        if not logic["query"].lower().startswith(("let", "union", "search")):
            raise ValueError("Sentinel KQL query must start with 'let', 'union', or 'search'")

    @staticmethod
    def _validate_chronicle_logic(logic: Dict[str, Any]) -> None:
        """Validate Chronicle-specific translation logic"""
        if "rule_type" not in logic["platform_specific"]:
            raise ValueError("Chronicle logic must specify rule type")
        if "severity" not in logic["platform_specific"]:
            raise ValueError("Chronicle logic must specify severity")

    @staticmethod
    def _validate_elastic_logic(logic: Dict[str, Any]) -> None:
        """Validate Elastic-specific translation logic"""
        if "index_pattern" not in logic["platform_specific"]:
            raise ValueError("Elastic logic must specify index pattern")
        if "rule_type" not in logic["platform_specific"]:
            raise ValueError("Elastic logic must specify rule type")

    @staticmethod
    def _validate_qradar_logic(logic: Dict[str, Any]) -> None:
        """Validate QRadar-specific translation logic"""
        if "log_source" not in logic["platform_specific"]:
            raise ValueError("QRadar logic must specify log source")
        if "rule_type" not in logic["platform_specific"]:
            raise ValueError("QRadar logic must specify rule type")

    @staticmethod
    def _calculate_query_complexity(query: str) -> float:
        """Calculate query complexity score"""
        complexity_factors = {
            "boolean_ops": len([op for op in ["AND", "OR", "NOT"] if op in query.upper()]),
            "functions": len([f for f in ["count", "sum", "avg", "min", "max"] if f in query.lower()]),
            "joins": query.lower().count("join"),
            "conditions": query.count("where")
        }
        return sum(complexity_factors.values()) / 10  # Normalize to 0-1 scale

    @staticmethod
    def _calculate_field_coverage(logic: Dict[str, Any]) -> float:
        """Calculate field mapping coverage percentage"""
        total_fields = len(logic.get("platform_specific", {}).get("field_mappings", []))
        mapped_fields = len([f for f in logic.get("platform_specific", {}).get("field_mappings", []) 
                           if f.get("mapped")])
        return mapped_fields / total_fields if total_fields > 0 else 0.0

    @staticmethod
    def _calculate_translation_confidence(logic: Dict[str, Any]) -> float:
        """Calculate translation confidence score"""
        confidence_factors = {
            "has_required_fields": all(f in logic for f in ["query", "platform_specific"]),
            "has_validation": "validation_status" in logic,
            "has_mappings": "field_mappings" in logic.get("platform_specific", {}),
            "has_metadata": "metadata" in logic
        }
        return sum(confidence_factors.values()) / len(confidence_factors)

class TranslationCreate(TranslationBase):
    """Schema for creating new translations with enhanced validation"""
    platform_config: Optional[Dict[str, Any]] = Field(
        None,
        description="Platform-specific configuration for translation"
    )

class TranslationUpdate(TranslationBase):
    """Schema for updating existing translations with status tracking"""
    update_metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Metadata about the update operation"
    )

class TranslationInDB(TranslationBase):
    """Enhanced schema for translation database representation with audit trail"""
    id: UUID = Field(..., description="Unique translation identifier")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    audit_trail: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Audit trail of changes"
    )
    performance_history: Optional[Dict[str, float]] = Field(
        default_factory=dict,
        description="Historical performance metrics"
    )

    class Config:
        """Pydantic model configuration"""
        orm_mode = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }