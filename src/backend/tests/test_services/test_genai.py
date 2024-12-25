"""
Test suite for GenAI service components with comprehensive validation of
processing time, accuracy, and functionality requirements.

Versions:
- pytest: 7.0+
- pytest-asyncio: 0.21+
- mock: 3.11+
- time: 3.11+
"""

import pytest
import pytest_asyncio
import json
import time
from unittest.mock import Mock, patch, AsyncMock
from typing import Dict, List

# Internal imports
from app.services.genai.models import OpenAIModel
from app.services.genai.processor import GenAIProcessor, ProcessingResult
from app.services.genai.validation import DetectionValidator

# Test constants
TEST_THREAT_DESCRIPTION = "Process injection technique using CreateRemoteThread with detailed IOCs and MITRE mapping"
TEST_DETECTION = {
    "title": "Process Injection Detection",
    "logic": "process.create where target.pid != null",
    "platform": "elastic",
    "mitre": {"technique": "T1055"}
}
TEST_INTELLIGENCE_TEXT = "Threat actors are using PowerShell scripts for lateral movement with encoded commands and persistence mechanisms"
MAX_PROCESSING_TIME = 120  # Maximum processing time in seconds
MIN_TRANSLATION_ACCURACY = 0.95  # Minimum required translation accuracy

class TestOpenAIModel:
    """Test suite for OpenAI model implementation with performance validation."""

    @pytest.fixture
    def model(self):
        """Initialize test model instance with monitoring."""
        return OpenAIModel(
            model_name="gpt-4",
            temperature=0.7,
            max_tokens=4000
        )

    @pytest.fixture
    def mock_response(self):
        """Mock OpenAI API response."""
        return Mock(
            choices=[Mock(message=Mock(content=json.dumps(TEST_DETECTION)))],
            usage=Mock(total_tokens=150)
        )

    @pytest.mark.asyncio
    async def test_generate_async(self, model, mock_response):
        """Test asynchronous text generation with timing validation."""
        with patch('openai.AsyncOpenAI.chat.completions.create', 
                  new_callable=AsyncMock) as mock_create:
            # Configure mock response
            mock_create.return_value = mock_response
            
            # Test messages
            messages = [
                {"role": "system", "content": "You are a detection engineer."},
                {"role": "user", "content": TEST_THREAT_DESCRIPTION}
            ]
            
            # Measure processing time
            start_time = time.perf_counter()
            response = await model.generate_async(messages)
            processing_time = time.perf_counter() - start_time
            
            # Validate processing time
            assert processing_time <= MAX_PROCESSING_TIME, \
                f"Processing time {processing_time}s exceeded limit of {MAX_PROCESSING_TIME}s"
            
            # Validate response format
            detection = json.loads(response)
            assert "title" in detection
            assert "logic" in detection
            assert "mitre" in detection
            
            # Verify metrics tracking
            assert model._metrics["total_requests"] == 1
            assert model._metrics["successful_requests"] == 1
            assert model._metrics["total_tokens"] > 0

    @pytest.mark.asyncio
    async def test_generate_with_retry(self, model):
        """Test retry mechanism with exponential backoff."""
        with patch('openai.AsyncOpenAI.chat.completions.create', 
                  new_callable=AsyncMock) as mock_create:
            # Configure mock to fail twice then succeed
            mock_create.side_effect = [
                Exception("API Error"),
                Exception("Rate Limit"),
                Mock(
                    choices=[Mock(message=Mock(content=json.dumps(TEST_DETECTION)))],
                    usage=Mock(total_tokens=150)
                )
            ]
            
            messages = [{"role": "user", "content": TEST_THREAT_DESCRIPTION}]
            response = await model.generate_async(messages)
            
            # Verify retry attempts
            assert mock_create.call_count == 3
            assert json.loads(response)["title"] == TEST_DETECTION["title"]

class TestGenAIProcessor:
    """Test suite for GenAI processor with accuracy validation."""

    @pytest.fixture
    def processor(self):
        """Initialize processor instance with test configuration."""
        return GenAIProcessor()

    @pytest.mark.asyncio
    async def test_create_detection(self, processor):
        """Test detection creation with performance monitoring."""
        with patch('app.services.genai.models.OpenAIModel.generate_async', 
                  new_callable=AsyncMock) as mock_generate:
            # Configure mock response
            mock_generate.return_value = json.dumps(TEST_DETECTION)
            
            # Test detection creation
            start_time = time.perf_counter()
            result = await processor.create_detection(
                threat_description=TEST_THREAT_DESCRIPTION,
                platform="elastic",
                required_fields=["process.name", "process.pid"]
            )
            processing_time = time.perf_counter() - start_time
            
            # Validate processing time
            assert processing_time <= MAX_PROCESSING_TIME
            assert isinstance(result, ProcessingResult)
            assert result.success
            
            # Validate detection content
            detection = result.result
            assert detection["title"]
            assert detection["logic"]
            assert detection["mitre"]["technique"] == "T1055"

    @pytest.mark.asyncio
    async def test_translate_detection(self, processor):
        """Test detection translation with accuracy validation."""
        with patch('app.services.genai.models.OpenAIModel.generate_async', 
                  new_callable=AsyncMock) as mock_generate:
            # Mock successful translation
            translated_detection = {
                "original_detection": TEST_DETECTION,
                "translated_detection": {
                    "title": "Process Injection Detection",
                    "search": "sourcetype=windows EventCode=10 TargetProcessId=*"
                }
            }
            mock_generate.return_value = json.dumps(translated_detection)
            
            # Test translation
            result = await processor.translate_detection(
                detection=TEST_DETECTION,
                source_platform="elastic",
                target_platform="splunk"
            )
            
            # Validate translation success and accuracy
            assert result.success
            assert result.processing_time <= MAX_PROCESSING_TIME
            assert "translated_detection" in result.result
            
            # Verify translation maintains key detection elements
            translated = result.result["translated_detection"]
            assert translated["title"] == TEST_DETECTION["title"]
            assert "search" in translated  # Platform-specific field

    @pytest.mark.asyncio
    async def test_process_intelligence(self, processor):
        """Test intelligence processing with timing validation."""
        with patch('app.services.genai.models.OpenAIModel.generate_async', 
                  new_callable=AsyncMock) as mock_generate:
            # Mock intelligence processing result
            intelligence_result = {
                "extracted_iocs": ["powershell.exe", "-enc"],
                "detection_opportunities": [
                    {
                        "title": "PowerShell Encoded Command",
                        "mitre_technique": "T1059.001"
                    }
                ]
            }
            mock_generate.return_value = json.dumps(intelligence_result)
            
            # Test intelligence processing
            start_time = time.perf_counter()
            result = await processor.process_intelligence(
                intelligence_text=TEST_INTELLIGENCE_TEXT,
                focus_areas=["lateral_movement", "persistence"]
            )
            processing_time = time.perf_counter() - start_time
            
            # Validate processing time and results
            assert processing_time <= MAX_PROCESSING_TIME
            assert result.success
            assert len(result.result["extracted_iocs"]) > 0
            assert len(result.result["detection_opportunities"]) > 0

    @pytest.mark.asyncio
    async def test_error_handling(self, processor):
        """Test error handling and retry mechanisms."""
        with patch('app.services.genai.models.OpenAIModel.generate_async', 
                  new_callable=AsyncMock) as mock_generate:
            # Simulate API error
            mock_generate.side_effect = Exception("API Error")
            
            result = await processor.create_detection(
                threat_description=TEST_THREAT_DESCRIPTION,
                platform="elastic",
                required_fields=["process.name"]
            )
            
            # Verify error handling
            assert not result.success
            assert len(result.errors) > 0
            assert result.processing_time <= MAX_PROCESSING_TIME

if __name__ == "__main__":
    pytest.main(["-v", "test_genai.py"])