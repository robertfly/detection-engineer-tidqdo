"""
Intelligence service initialization module providing a unified interface for processing
threat intelligence from various sources with comprehensive monitoring, error handling,
and security controls.

Versions:
- pydantic: 2.0+
- prometheus_client: 0.17+
- circuitbreaker: 1.4+
- structlog: 23.1+
"""

import asyncio
from typing import Dict, Union, Optional, List
from functools import wraps
from pydantic import BaseModel, ValidationError
from prometheus_client import Counter, Histogram
from circuitbreaker import circuit
import structlog
import time

# Internal imports
from .ocr import OCRProcessor
from .parser import IntelligenceParser
from .pdf import PDFProcessor
from .url import URLIntelligenceProcessor
from ...core.config import settings
from ...core.logging import get_logger

# Initialize logger with context
logger = get_logger(__name__, {"service": "intelligence_service"})

# Global constants
DEFAULT_CONFIG = {
    'ocr': {
        'enabled': True,
        'confidence_threshold': 80.0,
        'timeout': 30,
        'max_retries': 3
    },
    'pdf': {
        'extract_images': True,
        'max_pages': 50,
        'timeout': 60,
        'max_size': '25MB'
    },
    'url': {
        'timeout': 30,
        'max_size': '10MB',
        'rate_limit': '100/hour',
        'max_retries': 3
    },
    'security': {
        'input_validation': True,
        'content_sanitization': True,
        'max_content_size': '50MB'
    },
    'circuit_breaker': {
        'failure_threshold': 5,
        'recovery_timeout': 30,
        'max_retries': 3
    }
}

# Prometheus metrics
METRICS = {
    'processing_time': Histogram(
        'intelligence_processing_seconds',
        'Time spent processing intelligence',
        ['source_type', 'status']
    ),
    'success_counter': Counter(
        'intelligence_processing_success_total',
        'Total successful intelligence processing operations',
        ['source_type']
    ),
    'error_counter': Counter(
        'intelligence_processing_errors_total',
        'Total intelligence processing errors',
        ['source_type', 'error_type']
    )
}

class ProcessingResult(BaseModel):
    """Structured result for intelligence processing operations"""
    success: bool
    source_type: str
    content: Optional[Dict] = None
    errors: List[Dict] = []
    processing_time: float = 0.0
    metadata: Dict = {}

def monitor_performance(func):
    """Decorator for monitoring processing performance"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        source_type = kwargs.get('source_type', 'unknown')
        
        try:
            result = await func(*args, **kwargs)
            processing_time = time.perf_counter() - start_time
            
            # Update metrics
            METRICS['processing_time'].labels(
                source_type=source_type,
                status='success' if result.success else 'error'
            ).observe(processing_time)
            
            if result.success:
                METRICS['success_counter'].labels(source_type=source_type).inc()
            else:
                METRICS['error_counter'].labels(
                    source_type=source_type,
                    error_type=result.errors[0]['code'] if result.errors else 'unknown'
                ).inc()
            
            return result
            
        except Exception as e:
            processing_time = time.perf_counter() - start_time
            METRICS['processing_time'].labels(
                source_type=source_type,
                status='error'
            ).observe(processing_time)
            METRICS['error_counter'].labels(
                source_type=source_type,
                error_type=type(e).__name__
            ).inc()
            raise
            
    return wrapper

class IntelligenceService:
    """
    Main intelligence service class providing a unified interface for processing
    threat intelligence from various sources with comprehensive monitoring,
    error handling, and security controls.
    """

    def __init__(self, config: Optional[Dict] = None):
        """
        Initialize intelligence service with configuration and monitoring.

        Args:
            config: Custom configuration overrides
        """
        self._config = {**DEFAULT_CONFIG, **(config or {})}
        
        # Initialize processors
        self._ocr_processor = OCRProcessor(
            config=self._config['ocr']
        )
        self._parser = IntelligenceParser()
        self._pdf_processor = PDFProcessor(
            config=self._config['pdf']
        )
        self._url_processor = URLIntelligenceProcessor(
            config=self._config['url']
        )
        
        logger.info("Intelligence service initialized successfully")

    @circuit(
        failure_threshold=DEFAULT_CONFIG['circuit_breaker']['failure_threshold'],
        recovery_timeout=DEFAULT_CONFIG['circuit_breaker']['recovery_timeout']
    )
    @monitor_performance
    async def process_intelligence(
        self,
        content: Union[str, bytes],
        source_type: str,
        options: Optional[Dict] = None
    ) -> ProcessingResult:
        """
        Process intelligence from any supported source with monitoring and error handling.

        Args:
            content: Intelligence content to process
            source_type: Type of intelligence source
            options: Additional processing options

        Returns:
            ProcessingResult: Structured processing results
        """
        start_time = time.perf_counter()
        options = options or {}
        
        try:
            # Validate input size
            content_size = len(content.encode()) if isinstance(content, str) else len(content)
            max_size = int(self._config['security']['max_content_size'].replace('MB', '')) * 1024 * 1024
            
            if content_size > max_size:
                return ProcessingResult(
                    success=False,
                    source_type=source_type,
                    errors=[{
                        "code": "SIZE_ERROR",
                        "message": f"Content size exceeds maximum allowed: {content_size} bytes"
                    }],
                    processing_time=time.perf_counter() - start_time
                )

            # Process based on source type
            if source_type == 'pdf':
                result = await self._pdf_processor.process_pdf_async(content, options)
            elif source_type == 'url':
                result = await self._url_processor.process_url_async(content, options)
            elif source_type == 'text':
                result = await self._parser.parse_text_async(content, options)
            else:
                return ProcessingResult(
                    success=False,
                    source_type=source_type,
                    errors=[{
                        "code": "INVALID_SOURCE",
                        "message": f"Unsupported source type: {source_type}"
                    }],
                    processing_time=time.perf_counter() - start_time
                )

            return ProcessingResult(
                success=result.success,
                source_type=source_type,
                content=result.content or result.extracted_data,
                errors=result.errors,
                processing_time=time.perf_counter() - start_time,
                metadata={
                    "source_type": source_type,
                    "processing_options": options,
                    **result.metadata
                }
            )

        except Exception as e:
            logger.error(
                "Intelligence processing failed",
                error=str(e),
                source_type=source_type
            )
            return ProcessingResult(
                success=False,
                source_type=source_type,
                errors=[{"code": "PROCESSING_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time
            )

    async def process_intelligence_async(
        self,
        content: Union[str, bytes],
        source_type: str,
        options: Optional[Dict] = None
    ) -> ProcessingResult:
        """
        Asynchronously process intelligence with monitoring.

        Args:
            content: Intelligence content to process
            source_type: Type of intelligence source
            options: Additional processing options

        Returns:
            ProcessingResult: Structured processing results
        """
        return await self.process_intelligence(content, source_type, options)