"""
Utility module providing comprehensive data formatting and transformation functions.
Implements standardized formatting for detection rules, API responses, and platform-specific data.

Version: 1.0.0
"""

# External imports - versions specified for security tracking
import json  # standard library
from datetime import datetime, timezone  # standard library
from typing import Dict, Any, Optional, List, Union
from pydantic import BaseModel, ValidationError  # pydantic v2.0+
from cachetools import TTLCache, cached  # cachetools v5.3+
import logging

# Internal imports
from ..constants import DETECTION_FORMATS
from .validation import validate_detection_format
from .security import SecurityUtils

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DATE_FORMAT = "YYYY-MM-DD"
DATETIME_FORMAT = "YYYY-MM-DDTHH:mm:ssZ"
DETECTION_OUTPUT_FORMATS = {
    "sigma": "yml",
    "kql": "kql",
    "spl": "spl",
    "yara-l": "yara"
}
FORMAT_CACHE_SIZE = 1000
FORMAT_CACHE_TTL = 3600  # 1 hour cache TTL

# Initialize cache for format transformations
format_cache = TTLCache(maxsize=FORMAT_CACHE_SIZE, ttl=FORMAT_CACHE_TTL)

class DetectionFormatError(Exception):
    """Custom exception for detection formatting errors"""
    pass

@cached(format_cache)
def format_detection_rule(
    detection_data: Dict[str, Any],
    output_format: str,
    validate_output: bool = True
) -> Dict[str, Any]:
    """
    Format detection rule into specified output format with enhanced validation.

    Args:
        detection_data: Detection rule data to format
        output_format: Target output format (sigma, kql, spl, yara-l)
        validate_output: Whether to validate the formatted output

    Returns:
        Dict[str, Any]: Formatted detection rule with validation status

    Raises:
        DetectionFormatError: If formatting fails or validation errors occur
    """
    try:
        # Validate input format
        is_valid, error_msg, validation_meta = validate_detection_format(detection_data)
        if not is_valid:
            raise DetectionFormatError(f"Invalid detection format: {error_msg}")

        # Sanitize input data
        sanitized_data = SecurityUtils.sanitize_data(detection_data)

        # Verify output format is supported
        if output_format not in DETECTION_OUTPUT_FORMATS:
            raise DetectionFormatError(f"Unsupported output format: {output_format}")

        # Apply format-specific transformations
        formatted_data = {
            "metadata": sanitized_data.get("metadata", {}),
            "formatted_at": datetime.now(timezone.utc).isoformat(),
            "format": output_format,
            "validation_status": validation_meta
        }

        if output_format == "sigma":
            formatted_data["detection"] = _format_sigma_rule(sanitized_data)
        elif output_format == "kql":
            formatted_data["detection"] = _format_kql_rule(sanitized_data)
        elif output_format == "spl":
            formatted_data["detection"] = _format_spl_rule(sanitized_data)
        elif output_format == "yara-l":
            formatted_data["detection"] = _format_yara_rule(sanitized_data)

        # Validate output if required
        if validate_output:
            is_valid, error_msg, _ = validate_detection_format(formatted_data["detection"])
            if not is_valid:
                raise DetectionFormatError(f"Output validation failed: {error_msg}")

        return formatted_data

    except Exception as e:
        logger.error(f"Detection formatting error: {str(e)}")
        raise DetectionFormatError(f"Formatting failed: {str(e)}")

def format_api_response(
    data: Dict[str, Any],
    status: str = "success",
    meta: Optional[Dict[str, Any]] = None,
    sanitize: bool = True
) -> Dict[str, Any]:
    """
    Format API response with enhanced security and error handling.

    Args:
        data: Response data to format
        status: Response status (success/error)
        meta: Optional metadata
        sanitize: Whether to sanitize response data

    Returns:
        Dict[str, Any]: Formatted API response
    """
    try:
        # Sanitize data if required
        formatted_data = SecurityUtils.sanitize_data(data) if sanitize else data

        # Format timestamps to UTC
        formatted_data = _format_timestamps(formatted_data)

        # Construct response
        response = {
            "status": status,
            "data": formatted_data,
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "version": "1.0"
            }
        }

        # Add custom metadata if provided
        if meta:
            response["meta"].update(meta)

        return response

    except Exception as e:
        logger.error(f"API response formatting error: {str(e)}")
        return {
            "status": "error",
            "error": {
                "code": "FORMAT_ERROR",
                "message": str(e)
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }

class ResponseFormatter:
    """Advanced response formatter with caching, validation, and security features"""

    def __init__(self, format_rules: Dict[str, Any], security_utils: SecurityUtils):
        """
        Initialize formatter with custom rules and security.

        Args:
            format_rules: Custom formatting rules
            security_utils: Security utilities instance
        """
        self._format_rules = format_rules
        self._cache = TTLCache(maxsize=FORMAT_CACHE_SIZE, ttl=FORMAT_CACHE_TTL)
        self._security = security_utils

    def format(self, data: Dict[str, Any], use_cache: bool = True) -> Dict[str, Any]:
        """
        Format data with security and performance features.

        Args:
            data: Data to format
            use_cache: Whether to use caching

        Returns:
            Dict[str, Any]: Formatted data
        """
        try:
            # Check cache if enabled
            if use_cache:
                cache_key = json.dumps(data, sort_keys=True)
                if cache_key in self._cache:
                    return self._cache[cache_key]

            # Sanitize input
            sanitized_data = self._security.sanitize_data(data)

            # Apply format rules
            formatted_data = self._apply_format_rules(sanitized_data)

            # Update cache
            if use_cache:
                self._cache[cache_key] = formatted_data

            return formatted_data

        except Exception as e:
            logger.error(f"Response formatting error: {str(e)}")
            raise

    def _apply_format_rules(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Apply custom format rules to data"""
        formatted = {}
        for key, value in data.items():
            if key in self._format_rules:
                formatted[key] = self._format_rules[key](value)
            else:
                formatted[key] = value
        return formatted

def _format_timestamps(data: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively format all timestamps to UTC ISO format"""
    formatted = {}
    for key, value in data.items():
        if isinstance(value, datetime):
            formatted[key] = value.astimezone(timezone.utc).isoformat()
        elif isinstance(value, dict):
            formatted[key] = _format_timestamps(value)
        elif isinstance(value, list):
            formatted[key] = [
                _format_timestamps(item) if isinstance(item, dict)
                else item for item in value
            ]
        else:
            formatted[key] = value
    return formatted

def _format_sigma_rule(data: Dict[str, Any]) -> Dict[str, Any]:
    """Format detection rule to Sigma format"""
    return {
        "title": data.get("name"),
        "description": data.get("description"),
        "logsource": data.get("metadata", {}).get("logsource", {}),
        "detection": data.get("logic", {}),
        "fields": data.get("metadata", {}).get("fields", []),
        "falsepositives": data.get("metadata", {}).get("falsepositives", []),
        "level": data.get("metadata", {}).get("level", "medium"),
        "tags": data.get("metadata", {}).get("tags", [])
    }

def _format_kql_rule(data: Dict[str, Any]) -> Dict[str, Any]:
    """Format detection rule to KQL format"""
    return {
        "name": data.get("name"),
        "description": data.get("description"),
        "query": data.get("logic", {}).get("query", ""),
        "queryFrequency": data.get("metadata", {}).get("queryFrequency", "5m"),
        "queryPeriod": data.get("metadata", {}).get("queryPeriod", "5m"),
        "severity": data.get("metadata", {}).get("severity", "Medium"),
        "tactics": data.get("metadata", {}).get("tactics", [])
    }

def _format_spl_rule(data: Dict[str, Any]) -> Dict[str, Any]:
    """Format detection rule to SPL format"""
    return {
        "name": data.get("name"),
        "description": data.get("description"),
        "search": data.get("logic", {}).get("query", ""),
        "correlation_rule": {
            "notable": {
                "rule_title": data.get("name"),
                "rule_description": data.get("description"),
                "severity": data.get("metadata", {}).get("severity", "medium"),
                "drilldown_name": "Investigate Detection"
            }
        }
    }

def _format_yara_rule(data: Dict[str, Any]) -> Dict[str, Any]:
    """Format detection rule to YARA-L format"""
    return {
        "rule_name": data.get("name").lower().replace(" ", "_"),
        "metadata": {
            "description": data.get("description"),
            "author": data.get("metadata", {}).get("author"),
            "reference": data.get("metadata", {}).get("reference", [])
        },
        "rule_body": data.get("logic", {}).get("query", ""),
        "tags": data.get("metadata", {}).get("tags", [])
    }