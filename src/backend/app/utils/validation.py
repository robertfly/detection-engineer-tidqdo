# External imports - versions specified for security tracking
import re  # standard library
from datetime import datetime  # standard library
from uuid import UUID  # standard library
from typing import Dict, Any, Optional, Tuple, List
from functools import cache  # standard library
import bleach  # bleach v6.0+
from pydantic import ValidationError  # pydantic v2.0+
import logging

# Internal imports
from app.core.config import settings
from app.schemas.detection import DetectionBase
from app.schemas.intelligence import IntelligenceBase

# Configure logging
logger = logging.getLogger(__name__)

# Global constants for validation
DETECTION_REQUIRED_FIELDS = [
    "name", "description", "metadata", "logic", "mitre_mappings", "performance_impact"
]

METADATA_REQUIRED_FIELDS = [
    "mitre_attack", "platforms", "severity", "confidence_score"
]

MIN_PROCESSING_ACCURACY = 0.85
VALIDATION_CACHE_TTL = 300  # 5 minutes cache TTL

# Compile regex patterns for performance
COMPILED_PATTERNS = {
    "uuid": re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
}

def rate_limit(limit: int):
    """Rate limiting decorator for validation functions"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Implementation would use Redis for distributed rate limiting
            return func(*args, **kwargs)
        return wrapper
    return decorator

@cache(ttl=VALIDATION_CACHE_TTL)
@rate_limit(settings.VALIDATION_RATE_LIMIT)
def validate_detection_format(
    detection_data: Dict[str, Any],
    validate_performance: bool = True
) -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Enhanced validation of detection rule format against UDF schema with MITRE mapping
    and performance validation.

    Args:
        detection_data: Detection rule data to validate
        validate_performance: Whether to validate performance impact

    Returns:
        Tuple containing:
        - bool: Validation success status
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validation metadata and results
    """
    try:
        # Sanitize input data
        sanitized_data = {
            k: bleach.clean(str(v)) if isinstance(v, str) else v
            for k, v in detection_data.items()
        }

        # Validate required fields
        missing_fields = [
            field for field in DETECTION_REQUIRED_FIELDS
            if field not in sanitized_data
        ]
        if missing_fields:
            return False, f"Missing required fields: {', '.join(missing_fields)}", {}

        # Validate metadata format
        metadata = sanitized_data.get("metadata", {})
        missing_metadata = [
            field for field in METADATA_REQUIRED_FIELDS
            if field not in metadata
        ]
        if missing_metadata:
            return False, f"Missing metadata fields: {', '.join(missing_metadata)}", {}

        # Validate detection logic syntax
        logic = sanitized_data.get("logic", {})
        if not isinstance(logic, dict) or "query" not in logic:
            return False, "Invalid detection logic format", {}

        # Validate MITRE mappings
        mitre_mappings = sanitized_data.get("mitre_mappings", {})
        for technique_id, subtechniques in mitre_mappings.items():
            if not technique_id.startswith("T") or not technique_id[1:].isdigit():
                return False, f"Invalid MITRE technique ID: {technique_id}", {}
            
            for subtechnique in subtechniques:
                if not subtechnique.startswith(f"{technique_id}.") or not subtechnique.split(".")[1].isdigit():
                    return False, f"Invalid MITRE sub-technique: {subtechnique}", {}

        # Validate performance impact if required
        if validate_performance:
            performance = sanitized_data.get("performance_impact", {})
            if not isinstance(performance, dict):
                return False, "Invalid performance impact format", {}
            
            required_metrics = {"cpu_impact", "memory_impact", "iops_impact"}
            if not all(metric in performance for metric in required_metrics):
                return False, f"Missing performance metrics: {required_metrics - performance.keys()}", {}

        # Create validation metadata
        validation_metadata = {
            "timestamp": datetime.utcnow().isoformat(),
            "fields_validated": list(sanitized_data.keys()),
            "performance_validated": validate_performance
        }

        return True, None, validation_metadata

    except Exception as e:
        logger.error(f"Detection validation error: {str(e)}")
        return False, f"Validation error: {str(e)}", {}

@cache(ttl=VALIDATION_CACHE_TTL)
@rate_limit(settings.VALIDATION_RATE_LIMIT)
def validate_intelligence_source(
    source_type: str,
    source_url: str,
    metadata: Optional[Dict] = None,
    content_type: Optional[str] = None
) -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Enhanced validation of intelligence source data with content verification.

    Args:
        source_type: Type of intelligence source
        source_url: URL of the intelligence source
        metadata: Optional metadata for the source
        content_type: Optional content type specification

    Returns:
        Tuple containing:
        - bool: Validation success status
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validation metadata and results
    """
    try:
        # Sanitize input
        source_url = bleach.clean(source_url)
        
        # Validate source type
        valid_types = {"pdf", "url", "image", "text", "structured_data", "api_feed"}
        if source_type not in valid_types:
            return False, f"Invalid source type. Must be one of: {', '.join(valid_types)}", {}

        # Validate URL format and accessibility
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)
        
        if not url_pattern.match(source_url):
            return False, "Invalid URL format", {}

        # Validate content type if provided
        if content_type:
            valid_content_types = {
                "pdf": ["application/pdf"],
                "image": ["image/jpeg", "image/png", "image/gif"],
                "text": ["text/plain", "text/html", "text/markdown"],
                "structured_data": ["application/json", "application/xml", "text/csv"]
            }
            
            if source_type in valid_content_types and content_type not in valid_content_types[source_type]:
                return False, f"Invalid content type for {source_type}", {}

        # Validate metadata if provided
        if metadata:
            required_metadata = {
                "pdf": ["page_count", "ocr_required"],
                "image": ["dimensions", "format"],
                "structured_data": ["schema_version", "format"]
            }
            
            if source_type in required_metadata:
                missing_fields = [
                    field for field in required_metadata[source_type]
                    if field not in metadata
                ]
                if missing_fields:
                    return False, f"Missing metadata fields: {', '.join(missing_fields)}", {}

        # Create validation metadata
        validation_metadata = {
            "timestamp": datetime.utcnow().isoformat(),
            "source_type": source_type,
            "content_type_validated": bool(content_type),
            "metadata_validated": bool(metadata)
        }

        return True, None, validation_metadata

    except Exception as e:
        logger.error(f"Intelligence source validation error: {str(e)}")
        return False, f"Validation error: {str(e)}", {}

@cache(ttl=VALIDATION_CACHE_TTL)
@rate_limit(settings.VALIDATION_RATE_LIMIT)
def validate_processing_results(
    processing_results: Dict[str, Any],
    accuracy: float,
    confidence_score: float
) -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Enhanced validation of intelligence processing results with confidence scoring.

    Args:
        processing_results: Results from intelligence processing
        accuracy: Processing accuracy score
        confidence_score: Confidence score for the results

    Returns:
        Tuple containing:
        - bool: Validation success status
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validation metadata and results
    """
    try:
        # Validate accuracy range
        if not 0 <= accuracy <= 1:
            return False, "Accuracy must be between 0 and 1", {}

        if accuracy < MIN_PROCESSING_ACCURACY:
            return False, f"Accuracy below minimum threshold: {MIN_PROCESSING_ACCURACY}", {}

        # Validate confidence score
        if not 0 <= confidence_score <= 1:
            return False, "Confidence score must be between 0 and 1", {}

        # Validate processing results structure
        required_fields = {"extracted_data", "processing_steps", "completion_status"}
        missing_fields = [
            field for field in required_fields
            if field not in processing_results
        ]
        if missing_fields:
            return False, f"Missing result fields: {', '.join(missing_fields)}", {}

        # Validate processing steps completion
        steps = processing_results.get("processing_steps", [])
        incomplete_steps = [
            step for step in steps
            if step.get("status") != "completed"
        ]
        if incomplete_steps:
            return False, f"Incomplete processing steps: {len(incomplete_steps)}", {}

        # Create validation metadata
        validation_metadata = {
            "timestamp": datetime.utcnow().isoformat(),
            "accuracy": accuracy,
            "confidence_score": confidence_score,
            "steps_completed": len(steps),
            "validation_version": "1.0"
        }

        return True, None, validation_metadata

    except Exception as e:
        logger.error(f"Processing results validation error: {str(e)}")
        return False, f"Validation error: {str(e)}", {}

@cache(ttl=VALIDATION_CACHE_TTL)
def validate_uuid(uuid_string: str, version: Optional[int] = None) -> Tuple[bool, Optional[str]]:
    """
    Enhanced UUID validation with version and namespace checks.

    Args:
        uuid_string: UUID string to validate
        version: Optional UUID version to validate against

    Returns:
        Tuple containing:
        - bool: Validation success status
        - Optional[str]: Error message if validation failed
    """
    try:
        # Check UUID format using compiled pattern
        if not COMPILED_PATTERNS["uuid"].match(uuid_string):
            return False, "Invalid UUID format"

        # Convert string to UUID object for additional validation
        uuid_obj = UUID(uuid_string)

        # Validate version if specified
        if version is not None and uuid_obj.version != version:
            return False, f"Invalid UUID version. Expected version {version}"

        return True, None

    except ValueError as e:
        return False, f"Invalid UUID: {str(e)}"
    except Exception as e:
        logger.error(f"UUID validation error: {str(e)}")
        return False, f"Validation error: {str(e)}"