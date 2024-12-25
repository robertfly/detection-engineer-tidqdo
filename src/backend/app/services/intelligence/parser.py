"""
Core intelligence parsing service for processing and extracting structured information
from various intelligence sources with enhanced error handling, performance monitoring,
and caching mechanisms.

Versions:
- asyncio: 3.11+
- pydantic: 2.0+
- prometheus_client: 0.17+
- cachetools: 5.3+
"""

import asyncio
import time
import hashlib
from typing import Dict, Any, Optional, Union
from functools import wraps
from pydantic import BaseModel, ValidationError
from prometheus_client import Counter, Histogram
from cachetools import TTLCache

# Internal imports
from .ocr import OCRProcessor
from ..genai.processor import GenAIProcessor
from ...core.config import settings
from ...core.logging import get_logger

# Initialize logger with context
logger = get_logger(__name__, {"service": "intelligence_parser"})

# Global constants from specification
DEFAULT_PARSER_CONFIG = {
    'max_content_size': '10MB',
    'timeout': 120,
    'extraction_confidence': 90.0,
    'focus_areas': ['techniques', 'tools', 'procedures'],
    'retry_count': 3,
    'cache_ttl': 3600,
    'circuit_breaker_threshold': 0.5
}

SUPPORTED_CONTENT_TYPES = [
    'text/plain',
    'text/html',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]

# Prometheus metrics
METRICS = {
    'processing_time': Histogram(
        'intelligence_processing_seconds',
        'Time spent processing intelligence',
        ['content_type', 'status']
    ),
    'success_rate': Counter(
        'intelligence_processing_success_total',
        'Total successful intelligence processing operations',
        ['content_type']
    ),
    'error_rate': Counter(
        'intelligence_processing_errors_total',
        'Total intelligence processing errors',
        ['content_type', 'error_type']
    ),
    'cache_hits': Counter(
        'intelligence_cache_hits_total',
        'Total cache hits during intelligence processing',
        ['content_type']
    )
}

class ProcessingResult(BaseModel):
    """Structured result for intelligence processing operations"""
    success: bool
    content_type: str
    extracted_data: Optional[Dict[str, Any]] = None
    errors: list = []
    processing_time: float = 0.0
    confidence_score: float = 0.0
    metadata: Dict[str, Any] = {}

def monitor_performance(func):
    """Decorator for monitoring processing performance"""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        start_time = time.perf_counter()
        content_type = kwargs.get('content_type', 'unknown')
        
        try:
            result = await func(self, *args, **kwargs)
            processing_time = time.perf_counter() - start_time
            
            # Update metrics
            METRICS['processing_time'].labels(
                content_type=content_type,
                status='success' if result.success else 'error'
            ).observe(processing_time)
            
            if result.success:
                METRICS['success_rate'].labels(content_type=content_type).inc()
            else:
                METRICS['error_rate'].labels(
                    content_type=content_type,
                    error_type=result.errors[0]['code'] if result.errors else 'unknown'
                ).inc()
            
            return result
            
        except Exception as e:
            processing_time = time.perf_counter() - start_time
            METRICS['processing_time'].labels(
                content_type=content_type,
                status='error'
            ).observe(processing_time)
            METRICS['error_rate'].labels(
                content_type=content_type,
                error_type='exception'
            ).inc()
            raise
            
    return wrapper

class IntelligenceParser:
    """
    Enhanced intelligence parsing service with comprehensive error handling,
    performance monitoring, and caching capabilities.
    """

    def __init__(self, config: Dict = None, enable_cache: bool = True,
                 enable_metrics: bool = True):
        """
        Initialize parser with enhanced configuration and monitoring.

        Args:
            config: Custom configuration overrides
            enable_cache: Enable result caching
            enable_metrics: Enable performance metrics collection
        """
        self._config = {**DEFAULT_PARSER_CONFIG, **(config or {})}
        
        # Initialize logger
        self._logger = logger.bind(
            parser_config=self._config,
            cache_enabled=enable_cache,
            metrics_enabled=enable_metrics
        )
        
        # Initialize processors
        self._ocr_processor = OCRProcessor(
            config={'confidence_threshold': self._config['extraction_confidence']}
        )
        self._genai_processor = GenAIProcessor()
        
        # Initialize cache if enabled
        self._cache = TTLCache(
            maxsize=1000,
            ttl=self._config['cache_ttl']
        ) if enable_cache else None
        
        # Circuit breaker state
        self._error_count = 0
        self._total_requests = 0
        
        self._logger.info("Intelligence parser initialized successfully")

    def _check_circuit_breaker(self) -> bool:
        """Check if circuit breaker should be triggered"""
        if self._total_requests < 10:
            return True
            
        error_rate = self._error_count / self._total_requests
        return error_rate < self._config['circuit_breaker_threshold']

    def _generate_cache_key(self, content: Union[str, bytes],
                          content_type: str) -> str:
        """Generate cache key for content"""
        content_hash = hashlib.sha256(
            content.encode() if isinstance(content, str) else content
        ).hexdigest()
        return f"{content_type}:{content_hash}"

    @monitor_performance
    async def parse_text_async(self, content: str,
                             options: Optional[Dict] = None) -> ProcessingResult:
        """
        Asynchronously parse text intelligence with enhanced error handling.

        Args:
            content: Text content to parse
            options: Additional parsing options

        Returns:
            ProcessingResult: Structured processing results
        """
        content_type = 'text/plain'
        start_time = time.perf_counter()
        
        try:
            # Validate circuit breaker
            if not self._check_circuit_breaker():
                raise RuntimeError("Circuit breaker triggered - too many errors")
                
            self._total_requests += 1
            
            # Check cache
            if self._cache is not None:
                cache_key = self._generate_cache_key(content, content_type)
                if cache_key in self._cache:
                    METRICS['cache_hits'].labels(content_type=content_type).inc()
                    return self._cache[cache_key]
            
            # Process with GenAI
            focus_areas = options.get('focus_areas', self._config['focus_areas'])
            processing_result = await self._genai_processor.process_intelligence(
                intelligence_text=content,
                focus_areas=focus_areas
            )
            
            if not processing_result.success:
                self._error_count += 1
                return ProcessingResult(
                    success=False,
                    content_type=content_type,
                    errors=processing_result.errors,
                    processing_time=time.perf_counter() - start_time
                )
            
            result = ProcessingResult(
                success=True,
                content_type=content_type,
                extracted_data=processing_result.result,
                processing_time=time.perf_counter() - start_time,
                confidence_score=processing_result.result.get('confidence', 0.0),
                metadata={
                    'focus_areas': focus_areas,
                    'processing_metrics': processing_result.performance_metrics
                }
            )
            
            # Update cache
            if self._cache is not None:
                self._cache[cache_key] = result
            
            return result
            
        except Exception as e:
            self._error_count += 1
            self._logger.error(
                "Text processing failed",
                error=str(e),
                content_length=len(content)
            )
            return ProcessingResult(
                success=False,
                content_type=content_type,
                errors=[{"code": "PROCESSING_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time
            )

    @monitor_performance
    async def parse_image_async(self, image_data: Union[str, bytes],
                              options: Optional[Dict] = None) -> ProcessingResult:
        """
        Asynchronously parse image-based intelligence with OCR.

        Args:
            image_data: Image data to process
            options: Additional parsing options

        Returns:
            ProcessingResult: Structured processing results
        """
        content_type = 'image/unknown'
        start_time = time.perf_counter()
        
        try:
            self._total_requests += 1
            
            # Extract text with OCR
            ocr_result = await self._ocr_processor.extract_text_async(
                image_data,
                options
            )
            
            if not ocr_result['validation'][0]:  # Check OCR validation status
                self._error_count += 1
                return ProcessingResult(
                    success=False,
                    content_type=content_type,
                    errors=[{
                        "code": "OCR_ERROR",
                        "message": ocr_result['validation'][1]
                    }],
                    processing_time=time.perf_counter() - start_time
                )
            
            # Process extracted text with GenAI
            text_result = await self.parse_text_async(
                ocr_result['text'],
                options
            )
            
            if not text_result.success:
                return text_result
            
            # Combine results
            result = ProcessingResult(
                success=True,
                content_type=content_type,
                extracted_data=text_result.extracted_data,
                processing_time=time.perf_counter() - start_time,
                confidence_score=min(
                    ocr_result['validation'][2]['mean_confidence'],
                    text_result.confidence_score
                ),
                metadata={
                    'ocr_metrics': ocr_result['validation'][2],
                    'text_processing_metrics': text_result.metadata
                }
            )
            
            return result
            
        except Exception as e:
            self._error_count += 1
            self._logger.error(
                "Image processing failed",
                error=str(e),
                content_type=content_type
            )
            return ProcessingResult(
                success=False,
                content_type=content_type,
                errors=[{"code": "PROCESSING_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time
            )

    def parse_text(self, content: str, options: Optional[Dict] = None) -> ProcessingResult:
        """
        Synchronous wrapper for text parsing.

        Args:
            content: Text content to parse
            options: Additional parsing options

        Returns:
            ProcessingResult: Structured processing results
        """
        return asyncio.run(self.parse_text_async(content, options))

    def parse_image(self, image_data: Union[str, bytes],
                   options: Optional[Dict] = None) -> ProcessingResult:
        """
        Synchronous wrapper for image parsing.

        Args:
            image_data: Image data to process
            options: Additional parsing options

        Returns:
            ProcessingResult: Structured processing results
        """
        return asyncio.run(self.parse_image_async(image_data, options))