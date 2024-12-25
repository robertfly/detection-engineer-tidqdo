# External imports - versions specified for security tracking
import pytest  # pytest v7.0+
import pytest_asyncio  # pytest-asyncio v0.21+
from http import HTTPStatus
import time
from typing import Dict, Any, List

# Internal imports
from app.schemas.translation import TranslationCreate, TranslationUpdate, TranslationResponse
from app.core.config import PlatformConfig

# Test constants
TEST_DETECTION_ID = "550e8400-e29b-41d4-a716-446655440000"
SUPPORTED_PLATFORMS = ["kql", "sigma", "spl", "yara-l"]
PLATFORM_CONFIGS = {
    "kql": {"rate_limit": 100, "protocol": "REST"},
    "sigma": {"rate_limit": 5000, "protocol": "REST"},
    "spl": {"rate_limit": 1000, "protocol": "REST"},
    "yara-l": {"rate_limit": 500, "protocol": "gRPC"}
}

# Test data generators
def generate_test_detection() -> Dict[str, Any]:
    """Generate test detection data with MITRE mappings"""
    return {
        "id": TEST_DETECTION_ID,
        "name": "Test Detection",
        "description": "Test detection for translation validation",
        "platform": "sigma",
        "logic": {
            "query": "process_creation.exe:*cmd.exe",
            "data_model": "process_creation"
        },
        "mitre_mapping": {
            "T1059": ["T1059.003"]
        }
    }

def generate_translation_data(platform: str) -> Dict[str, Any]:
    """Generate platform-specific translation test data"""
    platform_queries = {
        "kql": {
            "query": "let cmd_execution = ProcessCreation | where FileName =~ 'cmd.exe';",
            "platform_specific": {"table": "SecurityEvent", "analytics_rule": True}
        },
        "sigma": {
            "query": "title: CMD Execution\nlogsource:\n  product: windows\n  service: security",
            "platform_specific": {"level": "high", "status": "experimental"}
        },
        "spl": {
            "query": "index=windows sourcetype=WinEventLog:Security cmd.exe",
            "platform_specific": {"index": "windows", "sourcetype": "WinEventLog:Security"}
        },
        "yara-l": {
            "query": "rule detect_cmd {\n  meta:\n    author = 'test'\n  events:\n    $e.target.file.name = 'cmd.exe'\n}",
            "platform_specific": {"rule_type": "DETECTION", "severity": "HIGH"}
        }
    }
    
    return {
        "detection_id": TEST_DETECTION_ID,
        "platform": platform,
        "translated_logic": platform_queries[platform]
    }

@pytest.mark.asyncio
@pytest.mark.translations
async def test_create_translation(client, db, test_user):
    """
    Test translation creation with comprehensive validation of:
    - Platform-specific validations
    - Rate limit compliance
    - Translation accuracy
    - MITRE mapping preservation
    - Performance requirements
    """
    # Create test detection
    detection = generate_test_detection()
    await db.execute(
        "INSERT INTO detections (id, creator_id, name, platform, logic, mitre_mapping) "
        "VALUES ($1, $2, $3, $4, $5, $6)",
        detection["id"], test_user.id, detection["name"], detection["platform"],
        detection["logic"], detection["mitre_mapping"]
    )
    await db.commit()

    # Test translation creation for each supported platform
    for platform in SUPPORTED_PLATFORMS:
        # Start performance timer
        start_time = time.time()
        
        # Prepare translation data
        translation_data = generate_translation_data(platform)
        
        # Send creation request
        response = await client.post(
            "/api/v1/translations/",
            json=translation_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        
        # Validate response
        assert response.status_code == HTTPStatus.CREATED
        assert "X-Request-ID" in response.headers
        
        # Validate performance
        processing_time = time.time() - start_time
        assert processing_time < 5.0, f"Translation creation exceeded 5s limit: {processing_time}s"
        
        # Validate response data
        data = response.json()
        assert data["detection_id"] == TEST_DETECTION_ID
        assert data["platform"] == platform
        assert data["validation_status"] == "valid"
        assert float(data["performance_metrics"]["translation_confidence"]) >= 0.95
        
        # Validate platform-specific requirements
        platform_config = PLATFORM_CONFIGS[platform]
        assert "X-RateLimit-Remaining" in response.headers
        remaining = int(response.headers["X-RateLimit-Remaining"])
        assert remaining <= platform_config["rate_limit"]
        
        # Verify database storage
        db_translation = await db.fetch_one(
            "SELECT * FROM translations WHERE detection_id = $1 AND platform = $2",
            TEST_DETECTION_ID, platform
        )
        assert db_translation is not None
        assert db_translation["validation_status"] == "valid"

@pytest.mark.asyncio
@pytest.mark.translations
async def test_validate_translation(client, db, test_user):
    """
    Test translation validation endpoint with:
    - Performance metrics
    - Accuracy requirements
    - Platform-specific validation rules
    - Error handling
    """
    for platform in SUPPORTED_PLATFORMS:
        # Start performance timer
        start_time = time.time()
        
        # Prepare validation data
        translation_data = generate_translation_data(platform)
        
        # Send validation request
        response = await client.post(
            "/api/v1/translations/validate",
            json=translation_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        
        # Validate response
        assert response.status_code == HTTPStatus.OK
        
        # Validate performance
        validation_time = time.time() - start_time
        assert validation_time < 5.0, f"Validation exceeded 5s limit: {validation_time}s"
        
        # Validate response data
        data = response.json()
        assert data["is_valid"] is True
        assert float(data["accuracy_score"]) >= 0.95
        assert "validation_details" in data
        
        # Validate platform-specific rules
        validation_details = data["validation_details"]
        if platform == "kql":
            assert validation_details["table_exists"] is True
        elif platform == "spl":
            assert validation_details["index_exists"] is True
        elif platform == "yara-l":
            assert validation_details["syntax_valid"] is True
        
        # Verify rate limit headers
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert "X-RateLimit-Reset" in response.headers

@pytest.mark.asyncio
@pytest.mark.translations
async def test_list_translations(client, db, test_user):
    """
    Test translation listing with:
    - Pagination
    - Filtering
    - Performance requirements
    """
    # Create multiple test translations
    for platform in SUPPORTED_PLATFORMS:
        translation_data = generate_translation_data(platform)
        await db.execute(
            "INSERT INTO translations (detection_id, platform, translated_logic) "
            "VALUES ($1, $2, $3)",
            translation_data["detection_id"], platform, translation_data["translated_logic"]
        )
    await db.commit()
    
    # Test listing with various filters
    filters = [
        {},
        {"platform": "kql"},
        {"validation_status": "valid"},
        {"page": 1, "limit": 2}
    ]
    
    for filter_params in filters:
        # Start performance timer
        start_time = time.time()
        
        # Send list request
        response = await client.get(
            "/api/v1/translations/",
            params=filter_params,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        
        # Validate response
        assert response.status_code == HTTPStatus.OK
        
        # Validate performance
        list_time = time.time() - start_time
        assert list_time < 1.0, f"Listing exceeded 1s limit: {list_time}s"
        
        # Validate response data
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        
        # Validate pagination
        if "page" in filter_params:
            assert len(data["items"]) <= filter_params["limit"]
            assert data["page"] == filter_params["page"]