"""
Core intelligence service that orchestrates the processing and analysis of threat intelligence
from various sources with enhanced reliability and monitoring capabilities.

Versions:
- asyncio: 3.11+
- pydantic: 2.0+
- tenacity: 8.0+
- prometheus_client: 0.17+
- circuitbreaker: 1.3+
"""

import asyncio
import time
from typing import Dict, List, Union, IO, Optional
from functools import wraps
import logging
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential
from prometheus_client import Counter, Histogram, Gauge
from circuitbreaker import circuit, CircuitBreaker

# Internal imports
from .intelligence.ocr import OCRProcessor
from .intelligence.pdf import PDFProcessor
from .intelligence.url import URLIntelligenceProcessor
from .intelligence.parser import IntelligenceParser
from ..core.config import settings

# Global constants from specification
DEFAULT_INTELLIGENCE_CONFIG = {
    'timeout': 120,
    'max_retries': 3,
    'parallel_processing': True,
    'batch_size': 5,
    'extraction_confidence': 80.0,
    'circuit_breaker': {
        'failure_threshold': 5,
        'recovery_timeout': 60,
        'expected_exception_types': ['ConnectionError', 'TimeoutError']
    },
    'monitoring': {
        'metrics_enabled': True,
        'tracing_enabled': True,
        'health_check_interval': 60
    }
}

SUPPORTED_SOURCE_TYPES = ['pdf', 'url', 'text', 'image']

# Prometheus metrics
METRICS = {
    'processing_time': Histogram(
        'intelligence_processing_seconds',
        'Time spent processing intelligence sources',
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
    ),
    'active_processes': Gauge(
        'intelligence_active_processes',
        'Number of active intelligence processing operations'
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
    async def wrapper(self, *args, **kwargs):
        source_type = kwargs.get('source_type', 'unknown')
        METRICS['active_processes'].inc()
        start_time = time.perf_counter()
        
        try:
            result = await func(self, *args, **kwargs)
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
        finally:
            METRICS['active_processes'].dec()
            
    return wrapper

class IntelligenceService:
    """
    Core service class that orchestrates intelligence processing from various sources
    with enhanced production features.
    """

    def __init__(self, config: Dict = None):
        """Initialize intelligence service with all required processors"""
        self._config = {**DEFAULT_INTELLIGENCE_CONFIG, **(config or {})}
        
        # Initialize logger
        self._logger = logging.getLogger(__name__)
        self._logger.setLevel(settings.LOG_LEVEL)
        
        # Initialize processors
        self._ocr_processor = OCRProcessor(
            config={'confidence_threshold': self._config['extraction_confidence']}
        )
        self._pdf_processor = PDFProcessor()
        self._url_processor = URLIntelligenceProcessor()
        self._parser = IntelligenceParser()
        
        # Initialize circuit breaker
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=self._config['circuit_breaker']['failure_threshold'],
            recovery_timeout=self._config['circuit_breaker']['recovery_timeout'],
            expected_exceptions=tuple(
                eval(exc) for exc in self._config['circuit_breaker']['expected_exception_types']
            )
        )
        
        self._logger.info("Intelligence service initialized successfully")

    @monitor_performance
    @retry(
        stop=stop_after_attempt(DEFAULT_INTELLIGENCE_CONFIG['max_retries']),
        wait=wait_exponential(multiplier=2)
    )
    @circuit
    async def process_intelligence(
        self,
        source_data: Union[str, bytes, IO],
        source_type: str,
        options: Optional[Dict] = None
    ) -> ProcessingResult:
        """
        Process intelligence from any supported source with enhanced reliability.
        
        Args:
            source_data: Source data to process
            source_type: Type of source data
            options: Additional processing options
            
        Returns:
            ProcessingResult: Structured processing results
        """
        start_time = time.perf_counter()
        options = options or {}
        
        try:
            # Validate source type
            validation_result = self.validate_source(source_data, source_type)
            if not validation_result[0]:
                return ProcessingResult(
                    success=False,
                    source_type=source_type,
                    errors=[{"code": "VALIDATION_ERROR", "message": validation_result[1]}],
                    processing_time=time.perf_counter() - start_time
                )
            
            # Process based on source type
            if source_type == 'pdf':
                result = await self._pdf_processor.process_pdf_async(source_data, options)
            elif source_type == 'url':
                result = await self._url_processor.process_url_async(source_data, options)
            elif source_type == 'image':
                result = await self._ocr_processor.extract_text_async(source_data, options)
            elif source_type == 'text':
                result = await self._parser.parse_text_async(source_data, options)
            else:
                raise ValueError(f"Unsupported source type: {source_type}")
            
            if not result.success:
                return ProcessingResult(
                    success=False,
                    source_type=source_type,
                    errors=result.errors,
                    processing_time=time.perf_counter() - start_time,
                    metadata={'original_result': result.metadata}
                )
            
            return ProcessingResult(
                success=True,
                source_type=source_type,
                content=result.extracted_data if hasattr(result, 'extracted_data') else result.content,
                processing_time=time.perf_counter() - start_time,
                metadata={
                    'processor_metrics': result.metadata,
                    'confidence_score': getattr(result, 'confidence_score', None)
                }
            )
            
        except Exception as e:
            self._logger.error(
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
        source_data: Union[str, bytes, IO],
        source_type: str,
        options: Optional[Dict] = None
    ) -> ProcessingResult:
        """Async wrapper for intelligence processing"""
        return await self.process_intelligence(source_data, source_type, options)

    async def process_batch(
        self,
        sources: List[tuple[Union[str, bytes, IO], str]],
        options: Optional[Dict] = None
    ) -> List[ProcessingResult]:
        """
        Process multiple intelligence sources in parallel with enhanced reliability.
        
        Args:
            sources: List of (source_data, source_type) tuples
            options: Additional processing options
            
        Returns:
            List[ProcessingResult]: List of processing results
        """
        if not sources:
            return []
            
        # Group sources by type for optimal processing
        grouped_sources = {}
        for source_data, source_type in sources:
            grouped_sources.setdefault(source_type, []).append(source_data)
        
        # Process groups in parallel
        tasks = []
        for source_type, source_group in grouped_sources.items():
            for source_data in source_group:
                tasks.append(
                    self.process_intelligence(source_data, source_type, options)
                )
        
        # Wait for all tasks with timeout
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results and handle exceptions
            processed_results = []
            for result in results:
                if isinstance(result, Exception):
                    processed_results.append(
                        ProcessingResult(
                            success=False,
                            source_type="unknown",
                            errors=[{"code": "BATCH_ERROR", "message": str(result)}]
                        )
                    )
                else:
                    processed_results.append(result)
                    
            return processed_results
            
        except Exception as e:
            self._logger.error(f"Batch processing failed: {str(e)}")
            raise

    def validate_source(
        self,
        source_data: Union[str, bytes, IO],
        source_type: str
    ) -> tuple[bool, str]:
        """
        Enhanced validation of intelligence source data and type.
        
        Args:
            source_data: Source data to validate
            source_type: Type of source data
            
        Returns:
            tuple[bool, str]: Validation status and message
        """
        try:
            # Validate source type
            if source_type not in SUPPORTED_SOURCE_TYPES:
                return False, f"Unsupported source type: {source_type}"
            
            # Validate source data
            if source_data is None:
                return False, "Source data cannot be None"
                
            # Type-specific validation
            if source_type == 'url' and isinstance(source_data, str):
                if not source_data.startswith(('http://', 'https://')):
                    return False, "Invalid URL format"
                    
            elif source_type == 'text' and isinstance(source_data, str):
                if not source_data.strip():
                    return False, "Empty text content"
                    
            return True, "Validation successful"
            
        except Exception as e:
            return False, f"Validation error: {str(e)}"