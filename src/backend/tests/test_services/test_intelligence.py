"""
Comprehensive test suite for intelligence processing service validating PDF processing,
URL scraping, OCR capabilities, and text analysis functionality.

Versions:
- pytest: 7.0+
- pytest-asyncio: 0.21+
- pytest-timeout: 2.1+
"""

import pytest
import os
import json
from unittest.mock import Mock, patch
from typing import Dict, Any

# Internal imports
from app.services.intelligence import IntelligenceService
from app.services.intelligence.ocr import OCRProcessor
from tests.conftest import get_test_db

# Test configuration based on technical specifications
TEST_CONFIG = {
    'ocr': {
        'enabled': True,
        'lang': 'eng',
        'confidence_threshold': 80.0,
        'timeout': 30
    },
    'pdf': {
        'extract_images': True,
        'max_pages': 10,
        'accuracy_threshold': 90.0,
        'timeout': 60
    },
    'url': {
        'timeout': 5,
        'max_size': '1MB',
        'capture_threshold': 95.0
    },
    'security': {
        'max_retries': 3,
        'rate_limit': 100,
        'require_auth': True
    }
}

# Test data directory
TEST_DATA_DIR = 'tests/data/intelligence'

# Performance thresholds from technical specification
PERFORMANCE_THRESHOLDS = {
    'pdf_processing': 120,  # 2 minutes max processing time
    'url_processing': 30,   # 30 seconds max processing time
    'ocr_processing': 60    # 1 minute max OCR time
}

@pytest.mark.asyncio
class TestIntelligenceService:
    """
    Comprehensive test suite for intelligence service functionality including
    performance, security, and accuracy validation.
    """

    def setup_method(self, method):
        """Set up test method with fresh service instance and test data."""
        self._service = IntelligenceService(config=TEST_CONFIG)
        self._test_config = TEST_CONFIG
        self._performance_metrics = {}
        
        # Create test data directory if not exists
        os.makedirs(TEST_DATA_DIR, exist_ok=True)

    def teardown_method(self, method):
        """Clean up test resources and validate performance metrics."""
        # Record performance metrics
        if hasattr(self, '_performance_metrics'):
            with open(f"{TEST_DATA_DIR}/performance_metrics.json", 'a') as f:
                json.dump(self._performance_metrics, f)

    @pytest.mark.asyncio
    async def test_intelligence_service_initialization(self):
        """Validate intelligence service initialization with security controls."""
        service = IntelligenceService(config=self._test_config)
        
        # Verify service components initialization
        assert service._config['security']['require_auth'] == True
        assert service._config['security']['rate_limit'] == 100
        assert service._config['security']['max_retries'] == 3
        
        # Verify OCR configuration
        assert service._ocr_processor._config['confidence_threshold'] == 80.0
        assert service._ocr_processor._config['lang'] == 'eng'

    @pytest.mark.asyncio
    @pytest.mark.timeout(180)
    async def test_process_pdf_intelligence(self, get_test_db):
        """Test PDF processing with accuracy and performance validation."""
        # Prepare test PDF data
        test_pdf_path = f"{TEST_DATA_DIR}/test_document.pdf"
        with open(test_pdf_path, 'rb') as f:
            pdf_content = f.read()
        
        start_time = time.time()
        
        # Process PDF content
        result = await self._service.process_intelligence(
            content=pdf_content,
            source_type='pdf',
            options={'extract_images': True}
        )
        
        processing_time = time.time() - start_time
        
        # Validate processing time
        assert processing_time <= PERFORMANCE_THRESHOLDS['pdf_processing'], \
            f"PDF processing exceeded time threshold: {processing_time}s"
        
        # Validate accuracy threshold
        assert result.success == True
        assert result.metadata.get('accuracy', 0) >= self._test_config['pdf']['accuracy_threshold']
        
        # Verify extracted content structure
        assert 'content' in result.dict()
        assert 'metadata' in result.dict()
        assert 'processing_time' in result.dict()

    @pytest.mark.asyncio
    @pytest.mark.timeout(60)
    async def test_process_url_intelligence(self, get_test_db):
        """Test URL intelligence processing with performance validation."""
        test_url = "https://test.threat.intel/report.html"
        
        with patch('app.services.intelligence.URLIntelligenceProcessor') as mock_url:
            mock_url.return_value.process_url_async.return_value = {
                'success': True,
                'content': 'Test threat intelligence content',
                'metadata': {'url': test_url}
            }
            
            start_time = time.time()
            
            result = await self._service.process_intelligence(
                content=test_url,
                source_type='url',
                options={'dynamic_content': False}
            )
            
            processing_time = time.time() - start_time
            
            # Validate performance
            assert processing_time <= PERFORMANCE_THRESHOLDS['url_processing']
            assert result.success == True
            
            # Verify capture threshold
            assert result.metadata.get('capture_quality', 0) >= \
                self._test_config['url']['capture_threshold']

    @pytest.mark.asyncio
    async def test_ocr_processing_accuracy(self):
        """Test OCR processing accuracy and confidence scoring."""
        test_image_path = f"{TEST_DATA_DIR}/test_image.png"
        
        with patch('app.services.intelligence.ocr.OCRProcessor') as mock_ocr:
            mock_ocr.return_value.extract_text_async.return_value = {
                'text': 'Test OCR content',
                'confidence_scores': [90.0, 85.0, 95.0],
                'validation': (True, 'Success', {'mean_confidence': 90.0})
            }
            
            result = await self._service.process_intelligence(
                content=open(test_image_path, 'rb').read(),
                source_type='image',
                options={'ocr_enabled': True}
            )
            
            # Validate OCR results
            assert result.success == True
            assert result.metadata.get('ocr_quality', 0) >= \
                self._test_config['ocr']['confidence_threshold']

    @pytest.mark.asyncio
    async def test_intelligence_validation(self):
        """Test intelligence validation and security controls."""
        # Test with oversized content
        large_content = 'x' * (int(self._test_config['url']['max_size'].replace('MB', '')) * 1024 * 1024 + 1)
        
        result = await self._service.process_intelligence(
            content=large_content,
            source_type='text',
            options={}
        )
        
        assert result.success == False
        assert 'SIZE_ERROR' in str(result.errors)

    @pytest.mark.asyncio
    async def test_async_batch_processing(self):
        """Test asynchronous batch processing capabilities."""
        test_contents = [
            ('pdf', open(f"{TEST_DATA_DIR}/test1.pdf", 'rb').read()),
            ('url', "https://test.threat.intel/report1.html"),
            ('text', "Test threat intelligence content")
        ]
        
        # Process multiple sources concurrently
        tasks = [
            self._service.process_intelligence_async(
                content=content,
                source_type=source_type,
                options={}
            )
            for source_type, content in test_contents
        ]
        
        results = await asyncio.gather(*tasks)
        
        # Validate batch results
        assert all(result.success for result in results)
        assert len(results) == len(test_contents)

    @pytest.mark.asyncio
    async def test_error_handling_and_retry(self):
        """Test error handling and retry mechanism."""
        with patch('app.services.intelligence.IntelligenceService.process_intelligence') as mock_process:
            # Simulate failures then success
            mock_process.side_effect = [
                Exception("Processing error"),
                Exception("Retry error"),
                {'success': True, 'content': 'Test content'}
            ]
            
            result = await self._service.process_intelligence(
                content="Test content",
                source_type='text',
                options={'max_retries': 3}
            )
            
            # Verify retry behavior
            assert mock_process.call_count == 3
            assert result.success == True