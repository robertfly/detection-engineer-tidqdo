"""
Advanced PDF processing service with comprehensive security controls, performance monitoring,
and error handling for intelligence extraction from PDF documents.

Versions:
- PyPDF2: 3.0+
- asyncio: 3.11+
- pydantic: 2.0+
- prometheus_client: 0.17+
"""

import asyncio
import time
from typing import Dict, Union, IO, Optional, List
from functools import wraps
import logging
from concurrent.futures import ThreadPoolExecutor
import hashlib
from prometheus_client import Counter, Histogram, Gauge
import PyPDF2
from pydantic import BaseModel, ValidationError

# Internal imports
from .ocr import OCRProcessor
from .parser import IntelligenceParser
from ...core.config import settings
from ...core.logging import get_logger

# Initialize logger with context
logger = get_logger(__name__, {"service": "pdf_processor"})

# Global constants from specification
DEFAULT_PDF_CONFIG = {
    'max_pages': 500,
    'timeout': 120,
    'ocr_enabled': True,
    'extraction_mode': 'text_and_images',
    'batch_size': 10,
    'retry_attempts': 3,
    'cache_ttl': 3600,
    'quality_threshold': 0.9,
    'max_file_size_mb': 50
}

SUPPORTED_PDF_VERSIONS = ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '2.0']

# Prometheus metrics
METRICS = {
    'processing_time': Histogram(
        'pdf_processing_seconds',
        'Time spent processing PDF documents',
        ['status']
    ),
    'pages_processed': Counter(
        'pdf_pages_processed_total',
        'Total number of PDF pages processed'
    ),
    'ocr_quality': Gauge(
        'pdf_ocr_quality',
        'OCR extraction quality score'
    ),
    'errors': Counter(
        'pdf_processing_errors_total',
        'Total PDF processing errors',
        ['error_type']
    )
}

class ProcessingResult(BaseModel):
    """Structured result for PDF processing operations"""
    success: bool
    content: Optional[Dict] = None
    errors: List[Dict] = []
    processing_time: float = 0.0
    page_count: int = 0
    ocr_quality: float = 0.0
    metadata: Dict = {}

def monitor_performance(func):
    """Decorator for monitoring processing performance"""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        start_time = time.perf_counter()
        try:
            result = await func(self, *args, **kwargs)
            processing_time = time.perf_counter() - start_time
            
            # Update metrics
            METRICS['processing_time'].labels(
                status='success' if result.success else 'error'
            ).observe(processing_time)
            
            if result.success:
                METRICS['pages_processed'].inc(result.page_count)
                METRICS['ocr_quality'].set(result.ocr_quality)
            
            return result
            
        except Exception as e:
            processing_time = time.perf_counter() - start_time
            METRICS['processing_time'].labels(status='error').observe(processing_time)
            METRICS['errors'].labels(error_type=type(e).__name__).inc()
            raise
            
    return wrapper

class PDFProcessor:
    """
    Enhanced PDF processing service with comprehensive security controls,
    performance monitoring, and error handling capabilities.
    """

    def __init__(self, config: Dict = None):
        """
        Initialize PDF processor with enhanced configuration and monitoring.

        Args:
            config: Custom configuration overrides
        """
        self._config = {**DEFAULT_PDF_CONFIG, **(config or {})}
        
        # Initialize logger
        self._logger = logger.bind(
            pdf_config=self._config
        )
        
        # Initialize processors
        self._ocr_processor = OCRProcessor(
            config={'confidence_threshold': self._config['quality_threshold']}
        )
        self._intelligence_parser = IntelligenceParser()
        
        # Initialize thread pool for parallel processing
        self._executor = ThreadPoolExecutor(max_workers=self._config['batch_size'])
        
        self._logger.info("PDF processor initialized successfully")

    def _validate_pdf(self, pdf_data: Union[str, bytes, IO]) -> PyPDF2.PdfReader:
        """
        Validate PDF data with security checks.

        Args:
            pdf_data: PDF input data

        Returns:
            PyPDF2.PdfReader: Validated PDF reader instance
        """
        try:
            # Create PDF reader based on input type
            if isinstance(pdf_data, str):
                reader = PyPDF2.PdfReader(open(pdf_data, 'rb'))
            elif isinstance(pdf_data, bytes):
                reader = PyPDF2.PdfReader(BytesIO(pdf_data))
            else:
                reader = PyPDF2.PdfReader(pdf_data)
            
            # Security validations
            if len(reader.pages) > self._config['max_pages']:
                raise ValueError(f"PDF exceeds maximum page limit: {len(reader.pages)}")
            
            if reader.pdf_header[1:4] not in SUPPORTED_PDF_VERSIONS:
                raise ValueError(f"Unsupported PDF version: {reader.pdf_header[1:4]}")
            
            # Check file size
            pdf_size = len(pdf_data) if isinstance(pdf_data, bytes) else pdf_data.seek(0, 2)
            if pdf_size > (self._config['max_file_size_mb'] * 1024 * 1024):
                raise ValueError(f"PDF exceeds maximum file size: {pdf_size} bytes")
            
            return reader
            
        except Exception as e:
            self._logger.error(
                "PDF validation failed",
                error=str(e)
            )
            raise

    @monitor_performance
    async def process_pdf_async(
        self,
        pdf_data: Union[str, bytes, IO],
        options: Optional[Dict] = None
    ) -> ProcessingResult:
        """
        Asynchronously process PDF with comprehensive error handling.

        Args:
            pdf_data: PDF input data
            options: Additional processing options

        Returns:
            ProcessingResult: Structured processing results
        """
        start_time = time.perf_counter()
        options = options or {}
        
        try:
            # Validate PDF
            reader = self._validate_pdf(pdf_data)
            page_count = len(reader.pages)
            
            # Process pages in batches
            tasks = []
            for i in range(0, page_count, self._config['batch_size']):
                batch = list(range(i, min(i + self._config['batch_size'], page_count)))
                tasks.append(self._process_page_batch(reader, batch))
            
            # Wait for all batches with timeout
            batch_results = await asyncio.gather(
                *tasks,
                return_exceptions=True
            )
            
            # Combine and validate results
            extracted_text = []
            ocr_qualities = []
            errors = []
            
            for result in batch_results:
                if isinstance(result, Exception):
                    errors.append({
                        "code": "BATCH_ERROR",
                        "message": str(result)
                    })
                    continue
                    
                extracted_text.extend(result['text'])
                ocr_qualities.extend(result['qualities'])
            
            if not extracted_text:
                return ProcessingResult(
                    success=False,
                    errors=[{
                        "code": "EXTRACTION_ERROR",
                        "message": "No text could be extracted from PDF"
                    }] + errors,
                    processing_time=time.perf_counter() - start_time,
                    page_count=page_count
                )
            
            # Process extracted content
            intelligence_result = await self._intelligence_parser.parse_text_async(
                "\n".join(extracted_text)
            )
            
            if not intelligence_result.success:
                return ProcessingResult(
                    success=False,
                    errors=intelligence_result.errors + errors,
                    processing_time=time.perf_counter() - start_time,
                    page_count=page_count,
                    ocr_quality=sum(ocr_qualities) / len(ocr_qualities) if ocr_qualities else 0.0
                )
            
            return ProcessingResult(
                success=True,
                content=intelligence_result.extracted_data,
                processing_time=time.perf_counter() - start_time,
                page_count=page_count,
                ocr_quality=sum(ocr_qualities) / len(ocr_qualities) if ocr_qualities else 0.0,
                metadata={
                    "pdf_version": reader.pdf_header[1:4],
                    "processing_options": options,
                    "intelligence_metrics": intelligence_result.metadata
                }
            )
            
        except Exception as e:
            self._logger.error(
                "PDF processing failed",
                error=str(e)
            )
            return ProcessingResult(
                success=False,
                errors=[{"code": "PROCESSING_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time
            )

    async def _process_page_batch(
        self,
        reader: PyPDF2.PdfReader,
        page_indices: List[int]
    ) -> Dict:
        """
        Process a batch of PDF pages with OCR support.

        Args:
            reader: PDF reader instance
            page_indices: List of page indices to process

        Returns:
            Dict: Batch processing results
        """
        results = {
            'text': [],
            'qualities': []
        }
        
        for idx in page_indices:
            try:
                page = reader.pages[idx]
                
                # Extract text content
                text = page.extract_text()
                
                # Apply OCR if enabled and needed
                if self._config['ocr_enabled'] and not text.strip():
                    images = self._extract_images(page)
                    for image in images:
                        ocr_result = await self._ocr_processor.extract_text_async(image)
                        if ocr_result['validation'][0]:  # Check OCR validation status
                            text += "\n" + ocr_result['text']
                            results['qualities'].append(
                                ocr_result['validation'][2]['mean_confidence'] / 100.0
                            )
                
                results['text'].append(text)
                
            except Exception as e:
                self._logger.error(
                    "Page processing failed",
                    page=idx,
                    error=str(e)
                )
                continue
        
        return results

    def _extract_images(self, page: PyPDF2.PageObject) -> List[bytes]:
        """
        Extract images from PDF page with security validation.

        Args:
            page: PDF page object

        Returns:
            List[bytes]: List of extracted image data
        """
        images = []
        try:
            for image in page.images:
                # Validate image data
                if len(image.data) > (self._config['max_file_size_mb'] * 1024 * 1024):
                    continue
                    
                images.append(image.data)
                
        except Exception as e:
            self._logger.error(
                "Image extraction failed",
                error=str(e)
            )
            
        return images

    def process_pdf(
        self,
        pdf_data: Union[str, bytes, IO],
        options: Optional[Dict] = None
    ) -> ProcessingResult:
        """
        Synchronous wrapper for PDF processing.

        Args:
            pdf_data: PDF input data
            options: Additional processing options

        Returns:
            ProcessingResult: Structured processing results
        """
        return asyncio.run(self.process_pdf_async(pdf_data, options))