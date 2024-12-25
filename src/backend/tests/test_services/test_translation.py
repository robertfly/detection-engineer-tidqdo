# External imports - versions specified for security tracking
import pytest  # pytest 7.0+
from pytest_asyncio import fixture  # pytest-asyncio 0.21+
from pydantic import ValidationError  # pydantic 2.0+
from unittest.mock import Mock, patch  # python 3.11+
from freezegun import freeze_time  # freezegun 1.2+
from datetime import datetime, timedelta
from uuid import uuid4
import logging

# Internal imports
from app.services.translation import TranslationService
from app.schemas.translation import TranslationBase, TranslationCreate, TranslationResponse
from app.models.translation import TranslationPlatform, ValidationStatus

# Configure test logger
logger = logging.getLogger(__name__)

# Test constants
TEST_DETECTION_DATA = {
    "id": str(uuid4()),
    "name": "Test Detection",
    "description": "Test detection for translation validation",
    "logic": {
        "query": "process_name = 'malware.exe'",
        "data_model": {
            "source": "process",
            "category": "process_creation"
        }
    },
    "metadata": {
        "severity": "high",
        "confidence": 0.95
    },
    "mitre_mappings": {
        "T1059": ["T1059.001", "T1059.003"]
    }
}

SUPPORTED_PLATFORMS = ["sentinel", "splunk", "chronicle"]
PLATFORM_RATE_LIMITS = {
    "sentinel": 100,  # 100 req/min
    "splunk": 1000,   # 1000 req/min
    "chronicle": 500  # 500 req/min
}
PERFORMANCE_THRESHOLD = 5.0  # seconds

class TestTranslationService:
    """Comprehensive test suite for translation service functionality"""

    @pytest.fixture(autouse=True)
    async def setup_method(self):
        """Setup test environment with fresh service instance"""
        # Initialize service with test configuration
        self.service = TranslationService(
            cache_size=100,
            platform_configs=PLATFORM_RATE_LIMITS
        )
        
        # Initialize test data
        self.test_detection = TEST_DETECTION_DATA.copy()
        self.platform_configs = {
            "sentinel": {"table": "SecurityEvent"},
            "splunk": {"index": "main", "sourcetype": "windows"},
            "chronicle": {"rule_type": "GENERAL", "severity": "HIGH"}
        }

    @pytest.mark.asyncio
    async def test_translation_service_initialization(self):
        """Test correct initialization of translation service"""
        assert self.service is not None
        assert hasattr(self.service, '_translators')
        assert hasattr(self.service, '_platform_configs')
        assert hasattr(self.service, '_translation_cache')
        
        # Verify supported platforms are registered
        for platform in SUPPORTED_PLATFORMS:
            assert platform in self.service._translators
            assert platform in self.service._platform_configs
            
        # Verify rate limit configurations
        for platform, limit in PLATFORM_RATE_LIMITS.items():
            assert self.service._platform_configs[platform]["rate_limit"] == limit

    @pytest.mark.asyncio
    async def test_get_translator(self):
        """Test retrieval and validation of platform-specific translators"""
        # Test valid platform translator retrieval
        for platform in SUPPORTED_PLATFORMS:
            translator = self.service.get_translator(platform)
            assert translator is not None
            assert hasattr(translator, 'translate')
            assert hasattr(translator, 'validate_translation')
            
        # Test invalid platform handling
        with pytest.raises(ValueError, match="Unsupported platform"):
            self.service.get_translator("invalid_platform")
            
        # Test translator configuration
        sentinel_translator = self.service.get_translator(
            "sentinel",
            self.platform_configs["sentinel"]
        )
        assert hasattr(sentinel_translator, '_config')
        assert sentinel_translator._config.get("table") == "SecurityEvent"

    @pytest.mark.asyncio
    async def test_translate_detection(self):
        """Test translation accuracy and performance across platforms"""
        for source_platform in SUPPORTED_PLATFORMS:
            for target_platform in SUPPORTED_PLATFORMS:
                if source_platform != target_platform:
                    # Prepare test data
                    detection_logic = self.test_detection["logic"].copy()
                    detection_logic["platform"] = source_platform
                    
                    # Perform translation
                    start_time = datetime.now()
                    translated = await self.service.translate(
                        source_platform,
                        target_platform,
                        detection_logic,
                        use_cache=False
                    )
                    duration = (datetime.now() - start_time).total_seconds()
                    
                    # Validate translation results
                    assert translated is not None
                    assert "query" in translated
                    assert "platform_specific" in translated
                    
                    # Validate platform-specific requirements
                    if target_platform == "sentinel":
                        assert "table" in translated["platform_specific"]
                    elif target_platform == "splunk":
                        assert "sourcetype" in translated["platform_specific"]
                    elif target_platform == "chronicle":
                        assert "rule_type" in translated["platform_specific"]
                        assert "severity" in translated["platform_specific"]
                    
                    # Verify translation accuracy
                    validation_result = await self.service.validate_translation(
                        target_platform,
                        translated
                    )
                    assert validation_result is True
                    
                    # Verify performance
                    assert duration < PERFORMANCE_THRESHOLD

    @pytest.mark.asyncio
    @freeze_time("2024-01-01")
    async def test_rate_limiting(self):
        """Test platform-specific rate limit enforcement"""
        for platform in SUPPORTED_PLATFORMS:
            limit = PLATFORM_RATE_LIMITS[platform]
            detection_logic = self.test_detection["logic"].copy()
            
            # Test within rate limit
            for _ in range(limit):
                translated = await self.service.translate(
                    "sigma",
                    platform,
                    detection_logic
                )
                assert translated is not None
            
            # Test exceeding rate limit
            with pytest.raises(ValueError, match="Rate limit exceeded"):
                await self.service.translate(
                    "sigma",
                    platform,
                    detection_logic
                )
            
            # Test rate limit reset
            with freeze_time("2024-01-01", tick=True):
                # Advance time by 1 minute
                await self.service.translate(
                    "sigma",
                    platform,
                    detection_logic
                )
                assert translated is not None

    @pytest.mark.asyncio
    async def test_translation_validation(self):
        """Test comprehensive translation validation"""
        # Test valid translation
        valid_translation = {
            "query": "ProcessName = 'malware.exe'",
            "platform_specific": {
                "table": "SecurityEvent",
                "rule_type": "GENERAL"
            }
        }
        
        is_valid = await self.service.validate_translation(
            "sentinel",
            valid_translation
        )
        assert is_valid is True
        
        # Test invalid translation
        invalid_translation = {
            "query": "",  # Empty query
            "platform_specific": {}
        }
        
        is_valid = await self.service.validate_translation(
            "sentinel",
            invalid_translation
        )
        assert is_valid is False

    @pytest.mark.asyncio
    async def test_translation_caching(self):
        """Test translation caching functionality"""
        detection_logic = self.test_detection["logic"].copy()
        
        # First translation (cache miss)
        start_time = datetime.now()
        first_translation = await self.service.translate(
            "sigma",
            "sentinel",
            detection_logic,
            use_cache=True
        )
        first_duration = (datetime.now() - start_time).total_seconds()
        
        # Second translation (cache hit)
        start_time = datetime.now()
        second_translation = await self.service.translate(
            "sigma",
            "sentinel",
            detection_logic,
            use_cache=True
        )
        second_duration = (datetime.now() - start_time).total_seconds()
        
        # Verify cache hit is faster
        assert second_duration < first_duration
        assert first_translation == second_translation

    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test error handling and validation"""
        # Test invalid detection format
        invalid_detection = {"invalid": "format"}
        with pytest.raises(ValidationError):
            await self.service.translate(
                "sigma",
                "sentinel",
                invalid_detection
            )
        
        # Test unsupported platform
        with pytest.raises(ValueError, match="Unsupported platform"):
            await self.service.translate(
                "sigma",
                "invalid_platform",
                self.test_detection["logic"]
            )
        
        # Test invalid translation logic
        invalid_logic = {
            "query": None,
            "platform_specific": {}
        }
        with pytest.raises(ValidationError):
            await self.service.validate_translation(
                "sentinel",
                invalid_logic
            )