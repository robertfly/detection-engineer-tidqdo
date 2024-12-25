"""
Validation service for GenAI-generated detections with comprehensive error handling,
async support, and performance optimization.

Versions:
- jsonschema: 4.0+
- asyncio: 3.11+
- pydantic: 2.0+
"""

import asyncio
import json
import time
from threading import Lock
from typing import Dict, Optional
from jsonschema import validate, ValidationError, Draft7Validator
from pydantic import BaseModel
from functools import wraps

from .prompts import validate_platform, PLATFORM_SCHEMAS
from app.core.logging import get_logger

# Initialize logger with validation context
logger = get_logger(__name__, {"service": "detection_validation"})

# Global constants
VALIDATION_TIMEOUT = 30.0  # Maximum time in seconds for validation operations
MAX_VALIDATION_RETRIES = 3  # Maximum number of validation retry attempts

class ValidationResult(BaseModel):
    """Structured validation result with detailed error information"""
    is_valid: bool
    platform: str
    errors: list = []
    performance_metrics: Dict = {}
    validation_time: float = 0.0

def log_validation_metrics(func):
    """Decorator to log validation performance metrics"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        try:
            result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
            execution_time = time.perf_counter() - start_time
            logger.info(
                "Validation completed",
                execution_time=execution_time,
                success=result.get("is_valid", False)
            )
            return result
        except Exception as e:
            execution_time = time.perf_counter() - start_time
            logger.error(
                "Validation failed",
                error=str(e),
                execution_time=execution_time
            )
            raise
    return wrapper

class DetectionValidator:
    """
    Validates generated detections against platform-specific schemas with
    comprehensive error handling, caching, and async support.
    """

    def __init__(self, timeout: float = VALIDATION_TIMEOUT):
        """
        Initialize validator with thread-safe schema cache and configurable timeout.

        Args:
            timeout: Maximum validation timeout in seconds
        """
        self._schema_cache = {}
        self._cache_lock = Lock()
        self._timeout = timeout
        self._validator = Draft7Validator
        
        logger.info(
            "Initialized DetectionValidator",
            timeout=timeout
        )

    def _load_schema(self, platform: str) -> Dict:
        """
        Load and cache platform schema with thread safety.

        Args:
            platform: Target platform name

        Returns:
            Dict: Platform validation schema
        """
        with self._cache_lock:
            if platform not in self._schema_cache:
                if platform not in PLATFORM_SCHEMAS:
                    raise ValueError(f"Unsupported platform: {platform}")
                
                schema = PLATFORM_SCHEMAS[platform]
                # Validate schema format
                try:
                    Draft7Validator.check_schema(schema)
                    self._schema_cache[platform] = schema
                except Exception as e:
                    logger.error(
                        "Schema validation failed",
                        platform=platform,
                        error=str(e)
                    )
                    raise ValueError(f"Invalid schema for platform {platform}: {str(e)}")
                
            return self._schema_cache[platform]

    @log_validation_metrics
    async def validate_async(self, detection: Dict, platform: str) -> Dict:
        """
        Asynchronously validate detection with timeout and retry support.

        Args:
            detection: Detection rule to validate
            platform: Target platform

        Returns:
            Dict: Validation results with performance metrics
        """
        start_time = time.perf_counter()
        
        # Create validation task with timeout
        try:
            validation_task = asyncio.create_task(
                self._validate_with_retry(detection, platform)
            )
            result = await asyncio.wait_for(validation_task, timeout=self._timeout)
            
            # Add performance metrics
            result.performance_metrics.update({
                "validation_time": time.perf_counter() - start_time,
                "timeout_configured": self._timeout
            })
            
            return result.dict()
            
        except asyncio.TimeoutError:
            logger.error(
                "Validation timeout",
                platform=platform,
                timeout=self._timeout
            )
            return ValidationResult(
                is_valid=False,
                platform=platform,
                errors=[{"code": "TIMEOUT", "message": f"Validation timeout after {self._timeout}s"}],
                validation_time=time.perf_counter() - start_time
            ).dict()
        except Exception as e:
            logger.error(
                "Validation error",
                platform=platform,
                error=str(e)
            )
            return ValidationResult(
                is_valid=False,
                platform=platform,
                errors=[{"code": "ERROR", "message": str(e)}],
                validation_time=time.perf_counter() - start_time
            ).dict()

    async def _validate_with_retry(self, detection: Dict, platform: str) -> ValidationResult:
        """
        Implement retry logic for validation with exponential backoff.

        Args:
            detection: Detection to validate
            platform: Target platform

        Returns:
            ValidationResult: Validation results
        """
        retry_count = 0
        while retry_count < MAX_VALIDATION_RETRIES:
            try:
                return await self._validate_detection(detection, platform)
            except Exception as e:
                retry_count += 1
                if retry_count == MAX_VALIDATION_RETRIES:
                    raise
                wait_time = 2 ** retry_count
                logger.warning(
                    "Validation retry",
                    attempt=retry_count,
                    wait_time=wait_time,
                    error=str(e)
                )
                await asyncio.sleep(wait_time)

    async def _validate_detection(self, detection: Dict, platform: str) -> ValidationResult:
        """
        Core validation logic with comprehensive error checking.

        Args:
            detection: Detection to validate
            platform: Target platform

        Returns:
            ValidationResult: Validation results
        """
        start_time = time.perf_counter()
        errors = []

        # Validate platform support
        if not validate_platform(platform):
            return ValidationResult(
                is_valid=False,
                platform=platform,
                errors=[{"code": "PLATFORM_ERROR", "message": f"Unsupported platform: {platform}"}],
                validation_time=time.perf_counter() - start_time
            )

        # Load platform schema
        try:
            schema = self._load_schema(platform)
        except Exception as e:
            return ValidationResult(
                is_valid=False,
                platform=platform,
                errors=[{"code": "SCHEMA_ERROR", "message": str(e)}],
                validation_time=time.perf_counter() - start_time
            )

        # Validate detection format
        try:
            validate(instance=detection, schema=schema)
        except ValidationError as e:
            errors.append({
                "code": "VALIDATION_ERROR",
                "message": e.message,
                "path": list(e.path)
            })

        # Validate required fields
        required_fields = schema.get("required_fields", [])
        for field in required_fields:
            if field not in detection:
                errors.append({
                    "code": "MISSING_FIELD",
                    "message": f"Required field missing: {field}"
                })

        # Check platform-specific requirements
        try:
            self._validate_platform_specifics(detection, platform)
        except ValueError as e:
            errors.append({
                "code": "PLATFORM_SPECIFIC_ERROR",
                "message": str(e)
            })

        return ValidationResult(
            is_valid=len(errors) == 0,
            platform=platform,
            errors=errors,
            validation_time=time.perf_counter() - start_time,
            performance_metrics={
                "schema_size": len(json.dumps(schema)),
                "detection_size": len(json.dumps(detection))
            }
        )

    def _validate_platform_specifics(self, detection: Dict, platform: str) -> None:
        """
        Validate platform-specific requirements.

        Args:
            detection: Detection to validate
            platform: Target platform

        Raises:
            ValueError: If platform-specific validation fails
        """
        platform_config = PLATFORM_SCHEMAS.get(platform, {})
        
        # Validate query language
        if "query_language" in platform_config:
            expected_language = platform_config["query_language"]
            if detection.get("query_language") != expected_language:
                raise ValueError(f"Invalid query language. Expected: {expected_language}")

        # Validate field format
        if "field_format" in platform_config:
            field_format = platform_config["field_format"]
            if not self._validate_field_format(detection.get("fields", {}), field_format):
                raise ValueError(f"Invalid field format. Expected format: {field_format}")

    def _validate_field_format(self, fields: Dict, expected_format: str) -> bool:
        """
        Validate field formatting against platform requirements.

        Args:
            fields: Detection fields to validate
            expected_format: Expected field format

        Returns:
            bool: True if fields match expected format
        """
        # Implementation would check field formatting based on platform requirements
        return True  # Placeholder implementation