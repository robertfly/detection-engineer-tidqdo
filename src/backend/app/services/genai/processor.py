"""
Core processor service for GenAI operations with comprehensive error handling,
validation, and performance monitoring capabilities.

Versions:
- asyncio: 3.11+
- json: 3.11+
- pydantic: 2.0+
"""

import asyncio
import json
import time
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from functools import wraps

# Internal imports
from .models import OpenAIModel
from .prompts import (
    format_detection_prompt,
    format_translation_prompt,
    format_intelligence_prompt
)
from .validation import DetectionValidator
from app.core.config import settings
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__, {"service": "genai_processor"})

# Global constants
PROCESSING_TIMEOUT = 120.0  # Maximum processing time in seconds
MAX_RETRIES = 3  # Maximum number of retry attempts
RETRY_DELAY = 1.0  # Initial retry delay in seconds with exponential backoff

class ProcessingResult(BaseModel):
    """Structured result for GenAI processing operations"""
    success: bool
    result: Optional[Dict[str, Any]] = None
    errors: List[Dict[str, str]] = []
    processing_time: float = 0.0
    performance_metrics: Dict[str, Any] = {}

def log_processing_metrics(func):
    """Decorator to log processing performance metrics"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        try:
            result = await func(*args, **kwargs)
            execution_time = time.perf_counter() - start_time
            logger.info(
                "Processing completed",
                execution_time=execution_time,
                success=result.success
            )
            return result
        except Exception as e:
            execution_time = time.perf_counter() - start_time
            logger.error(
                "Processing failed",
                error=str(e),
                execution_time=execution_time
            )
            raise
    return wrapper

class GenAIProcessor:
    """
    Core processor for handling GenAI operations with comprehensive retry logic,
    validation, and performance monitoring.
    """

    def __init__(self):
        """Initialize processor with AI model and validator instances"""
        # Initialize OpenAI model with configuration
        self._model = OpenAIModel(
            model_name=settings.OPENAI_MODEL_NAME,
            temperature=0.7,  # Balanced creativity and consistency
            max_tokens=4000   # Maximum context for complex detections
        )
        
        # Initialize detection validator
        self._validator = DetectionValidator(timeout=PROCESSING_TIMEOUT)
        
        logger.info("Initialized GenAIProcessor")

    @log_processing_metrics
    async def create_detection(
        self,
        threat_description: str,
        platform: str,
        required_fields: List[str]
    ) -> ProcessingResult:
        """
        Create detection rule from threat description with validation and retries.

        Args:
            threat_description: Description of the threat to detect
            platform: Target detection platform
            required_fields: List of required fields for the detection

        Returns:
            ProcessingResult: Generated and validated detection with metadata
        """
        start_time = time.perf_counter()
        
        try:
            # Format detection prompt
            messages = format_detection_prompt(
                threat_description=threat_description,
                platform=platform,
                required_fields=required_fields
            )
            
            # Generate detection with retry logic
            detection_json = await self._generate_with_retry(messages)
            
            # Parse and validate detection
            detection = json.loads(detection_json)
            validation_result = await self._validator.validate_async(
                detection=detection,
                platform=platform
            )
            
            if not validation_result["is_valid"]:
                return ProcessingResult(
                    success=False,
                    errors=validation_result["errors"],
                    processing_time=time.perf_counter() - start_time,
                    performance_metrics={
                        "validation_time": validation_result["validation_time"],
                        "validation_metrics": validation_result["performance_metrics"]
                    }
                )
            
            return ProcessingResult(
                success=True,
                result=detection,
                processing_time=time.perf_counter() - start_time,
                performance_metrics={
                    "validation_time": validation_result["validation_time"],
                    "validation_metrics": validation_result["performance_metrics"]
                }
            )
            
        except Exception as e:
            logger.error(
                "Detection creation failed",
                error=str(e),
                threat_description=threat_description,
                platform=platform
            )
            return ProcessingResult(
                success=False,
                errors=[{"code": "PROCESSING_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time
            )

    @log_processing_metrics
    async def translate_detection(
        self,
        detection: Dict,
        source_platform: str,
        target_platform: str
    ) -> ProcessingResult:
        """
        Translate detection between platforms with validation.

        Args:
            detection: Original detection rule
            source_platform: Source platform
            target_platform: Target platform

        Returns:
            ProcessingResult: Translated detection with validation results
        """
        start_time = time.perf_counter()
        
        try:
            # Format translation prompt
            messages = format_translation_prompt(
                detection=json.dumps(detection),
                source_platform=source_platform,
                target_platform=target_platform
            )
            
            # Generate translation with retry logic
            translation_json = await self._generate_with_retry(messages)
            
            # Parse and validate translation
            translation = json.loads(translation_json)
            validation_result = await self._validator.validate_async(
                detection=translation["translated_detection"],
                platform=target_platform
            )
            
            if not validation_result["is_valid"]:
                return ProcessingResult(
                    success=False,
                    errors=validation_result["errors"],
                    processing_time=time.perf_counter() - start_time,
                    performance_metrics={
                        "validation_time": validation_result["validation_time"],
                        "validation_metrics": validation_result["performance_metrics"]
                    }
                )
            
            return ProcessingResult(
                success=True,
                result=translation,
                processing_time=time.perf_counter() - start_time,
                performance_metrics={
                    "validation_time": validation_result["validation_time"],
                    "validation_metrics": validation_result["performance_metrics"]
                }
            )
            
        except Exception as e:
            logger.error(
                "Detection translation failed",
                error=str(e),
                source_platform=source_platform,
                target_platform=target_platform
            )
            return ProcessingResult(
                success=False,
                errors=[{"code": "TRANSLATION_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time
            )

    @log_processing_metrics
    async def process_intelligence(
        self,
        intelligence_text: str,
        focus_areas: List[str]
    ) -> ProcessingResult:
        """
        Process threat intelligence for detection opportunities.

        Args:
            intelligence_text: Raw intelligence text
            focus_areas: List of focus areas for extraction

        Returns:
            ProcessingResult: Extracted detection opportunities and IOCs
        """
        start_time = time.perf_counter()
        
        try:
            # Format intelligence prompt
            messages = format_intelligence_prompt(
                intelligence_text=intelligence_text,
                focus_areas=focus_areas
            )
            
            # Generate intelligence analysis with retry logic
            analysis_json = await self._generate_with_retry(messages)
            
            # Parse analysis results
            analysis = json.loads(analysis_json)
            
            return ProcessingResult(
                success=True,
                result=analysis,
                processing_time=time.perf_counter() - start_time,
                performance_metrics={
                    "text_length": len(intelligence_text),
                    "focus_areas": len(focus_areas),
                    "opportunities_found": len(analysis.get("detection_opportunities", []))
                }
            )
            
        except Exception as e:
            logger.error(
                "Intelligence processing failed",
                error=str(e),
                text_length=len(intelligence_text)
            )
            return ProcessingResult(
                success=False,
                errors=[{"code": "INTELLIGENCE_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time
            )

    async def _generate_with_retry(self, messages: List[Dict[str, str]]) -> str:
        """
        Generate text with retry logic and exponential backoff.

        Args:
            messages: List of conversation messages

        Returns:
            str: Generated text response

        Raises:
            Exception: If all retry attempts fail
        """
        retry_count = 0
        last_error = None
        
        while retry_count < MAX_RETRIES:
            try:
                return await self._model.generate_async(messages)
            except Exception as e:
                retry_count += 1
                last_error = e
                
                if retry_count == MAX_RETRIES:
                    logger.error(
                        "Max retries exceeded",
                        error=str(e),
                        retry_count=retry_count
                    )
                    raise
                
                wait_time = RETRY_DELAY * (2 ** (retry_count - 1))
                logger.warning(
                    "Generation retry",
                    attempt=retry_count,
                    wait_time=wait_time,
                    error=str(e)
                )
                await asyncio.sleep(wait_time)