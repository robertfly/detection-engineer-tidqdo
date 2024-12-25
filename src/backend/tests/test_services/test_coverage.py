# External imports - versions specified for security tracking
import pytest  # pytest 7.0+
import pytest_asyncio  # pytest-asyncio 0.21+
import fakeredis  # fakeredis 2.0+
from unittest.mock import Mock, patch, AsyncMock  # unittest.mock 3.8+
import pytest_timeout  # pytest-timeout 2.1+
from datetime import datetime
import json
import uuid
from typing import Dict, List

# Internal imports
from app.services.coverage.analyzer import CoverageAnalyzer
from app.services.coverage.mapper import CoverageMapper
from app.services.coverage.mitre import MITREService
from app.models.coverage import Coverage
from app.models.detection import Detection, DetectionStatus, DetectionPlatform

# Configure test markers and settings
def pytest_configure(config):
    """Configure pytest environment with custom markers"""
    config.addinivalue_line(
        "markers", 
        "performance: mark test for performance validation"
    )
    config.addinivalue_line(
        "markers",
        "coverage: mark test for coverage analysis validation"
    )

@pytest.fixture
async def db_session():
    """Create mock database session for testing"""
    session = AsyncMock()
    session.begin = AsyncMock().__aenter__ = AsyncMock(return_value=session)
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    return session

@pytest.fixture
def redis_mock():
    """Create mock Redis instance with TTL support"""
    redis = fakeredis.FakeStrictRedis()
    return redis

@pytest.fixture
def mock_detection():
    """Create mock detection for testing"""
    return Detection(
        name="Test Detection",
        creator_id=uuid.uuid4(),
        library_id=uuid.uuid4(),
        platform=DetectionPlatform.sigma.value,
        metadata={"severity": "high"},
        logic={
            "query": "process_name = 'malware.exe'",
            "data_model": "process_creation"
        }
    )

@pytest.fixture
def mock_mitre_technique():
    """Create mock MITRE technique data"""
    return {
        "technique_id": "T1055",
        "name": "Process Injection",
        "description": "Test description",
        "tactic_refs": ["TA0002"],
        "is_subtechnique": False,
        "deprecated": False,
        "version": "1.0"
    }

class TestCoverageAnalyzer:
    """Test suite for coverage analysis functionality"""

    @pytest.fixture(autouse=True)
    async def setup(self, db_session, redis_mock):
        """Set up test environment for each test"""
        self.db_session = db_session
        self.redis_mock = redis_mock
        self.analyzer = CoverageAnalyzer(
            db_session=self.db_session,
            cache=self.redis_mock,
            cache_version="test_v1",
            config={"mitre_api_url": "http://test.local"}
        )
        self.performance_metrics = {
            "execution_time": 0,
            "memory_usage": 0,
            "cache_hits": 0
        }

    @pytest.mark.asyncio
    @pytest.mark.timeout(120)
    @pytest.mark.performance
    async def test_analyze_detection_coverage(self, mock_detection, mock_mitre_technique):
        """Test detection coverage analysis with performance validation"""
        # Mock MITRE technique data
        self.redis_mock.set(
            "mitre:test_v1:T1055",
            json.dumps(mock_mitre_technique)
        )

        # Add MITRE mapping to detection
        mock_detection.mitre_mapping = {
            "T1055": {
                "quality_score": 0.85,
                "mapping_type": "automated",
                "confidence": 0.9
            }
        }

        # Mock database query
        self.db_session.get.return_value = mock_detection

        # Execute coverage analysis
        start_time = datetime.now()
        result = await self.analyzer.analyze_detection_coverage(
            detection_id=mock_detection.id
        )

        # Validate execution time
        execution_time = (datetime.now() - start_time).total_seconds()
        assert execution_time <= 120, "Coverage analysis exceeded time limit"

        # Validate coverage results
        assert result["detection_id"] == str(mock_detection.id)
        assert result["coverage_score"] >= 0.4, "Coverage score below minimum threshold"
        assert len(result["mapped_techniques"]) > 0, "No techniques mapped"
        assert result["validation_errors"] == [], "Unexpected validation errors"

        # Validate technique mapping
        technique = result["mapped_techniques"][0]
        assert technique["technique_id"] == "T1055"
        assert technique["coverage_score"] >= 0.85
        assert technique.get("is_critical") is not None

    @pytest.mark.asyncio
    @pytest.mark.performance
    async def test_analyze_library_coverage(self, mock_detection):
        """Test library coverage analysis with performance metrics"""
        library_id = uuid.uuid4()
        detections = [mock_detection for _ in range(5)]
        
        # Mock database queries
        self.db_session.query.return_value.filter.return_value.filter.return_value \
            .offset.return_value.limit.return_value.all.return_value = detections

        # Execute library analysis
        start_time = datetime.now()
        result = await self.analyzer.analyze_library_coverage(library_id)

        # Validate execution time
        execution_time = (datetime.now() - start_time).total_seconds()
        assert execution_time <= 120, "Library analysis exceeded time limit"

        # Validate library coverage
        assert "overall_coverage" in result
        assert "technique_coverage" in result
        assert "critical_gaps" in result
        assert "recommendations" in result
        assert result["overall_coverage"] >= 0.0
        assert isinstance(result["technique_coverage"], dict)

    @pytest.mark.asyncio
    async def test_concurrent_analysis(self, mock_detection):
        """Test concurrent coverage analysis operations"""
        detection_ids = [uuid.uuid4() for _ in range(3)]
        
        # Mock database queries
        self.db_session.get.return_value = mock_detection

        # Execute concurrent analyses
        tasks = [
            self.analyzer.analyze_detection_coverage(detection_id)
            for detection_id in detection_ids
        ]
        results = await asyncio.gather(*tasks)

        # Validate results
        assert len(results) == len(detection_ids)
        for result in results:
            assert result["coverage_score"] >= 0.0
            assert "mapped_techniques" in result
            assert "validation_errors" in result

class TestCoverageMapper:
    """Test suite for MITRE technique mapping functionality"""

    @pytest.fixture(autouse=True)
    async def setup(self, db_session, redis_mock):
        """Set up test environment for mapper tests"""
        self.db_session = db_session
        self.redis_mock = redis_mock
        self.mapper = CoverageMapper(
            db_session=self.db_session,
            cache=self.redis_mock,
            config={"mitre_api_url": "http://test.local"}
        )

    @pytest.mark.asyncio
    @pytest.mark.timeout(120)
    async def test_map_detection(self, mock_detection, mock_mitre_technique):
        """Test MITRE technique mapping with validation"""
        # Mock AI processor response
        with patch("app.services.genai.processor.GenAIProcessor") as mock_ai:
            mock_ai.return_value.process_intelligence.return_value.success = True
            mock_ai.return_value.process_intelligence.return_value.result = {
                "mitre_mappings": [mock_mitre_technique]
            }

            # Execute mapping
            result = await self.mapper.map_detection(mock_detection.id)

            # Validate mapping results
            assert result["detection_id"] == str(mock_detection.id)
            assert len(result["techniques"]) > 0
            assert all(t["confidence"] >= 0.75 for t in result["techniques"])
            assert "coverage_mappings" in result
            assert "timestamp" in result

    @pytest.mark.asyncio
    async def test_mapping_validation(self, mock_detection):
        """Test mapping validation and error handling"""
        # Test with invalid technique
        invalid_technique = {"technique_id": "invalid"}
        
        with patch("app.services.genai.processor.GenAIProcessor") as mock_ai:
            mock_ai.return_value.process_intelligence.return_value.success = True
            mock_ai.return_value.process_intelligence.return_value.result = {
                "mitre_mappings": [invalid_technique]
            }

            result = await self.mapper.map_detection(mock_detection.id)
            assert len(result["techniques"]) == 0

class TestMITREService:
    """Test suite for MITRE ATT&CK data management"""

    @pytest.fixture(autouse=True)
    async def setup(self, redis_mock):
        """Set up test environment for MITRE service tests"""
        self.redis_mock = redis_mock
        self.mitre_service = MITREService(
            cache=self.redis_mock,
            config={"api_url": "http://test.local"}
        )

    @pytest.mark.asyncio
    async def test_technique_retrieval(self, mock_mitre_technique):
        """Test MITRE technique retrieval and caching"""
        technique_id = "T1055"
        
        # Test cache miss
        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__.return_value.json.return_value = \
                mock_mitre_technique
            mock_get.return_value.__aenter__.return_value.status = 200

            result = await self.mitre_service.get_technique(technique_id)
            assert result["technique_id"] == technique_id
            assert result["name"] == mock_mitre_technique["name"]

        # Test cache hit
        cached_result = await self.mitre_service.get_technique(technique_id)
        assert cached_result == result

    @pytest.mark.asyncio
    async def test_technique_validation(self, mock_mitre_technique):
        """Test MITRE technique validation"""
        technique_id = "T1055"
        
        # Mock technique data
        self.redis_mock.set(
            f"mitre:1.0.0:{technique_id}",
            json.dumps(mock_mitre_technique)
        )

        # Test validation
        result = await self.mitre_service.validate_technique_graph(
            technique_id,
            depth=1
        )
        assert result["valid"]
        assert result["technique_id"] == technique_id
        assert not result["errors"]
        assert "relationships" in result