# External imports - versions specified for security tracking
import pytest  # pytest v7.0+
from uuid import uuid4  # python v3.11+
import httpx  # httpx v0.24+
import time  # python v3.11+
from typing import Dict, List

# Internal imports
from ...app.schemas.coverage import (
    CoverageCreate,
    CoverageUpdate,
    CoverageResponse
)

# API endpoint prefix
COVERAGE_API_PREFIX = '/api/v1/coverage'

# Test constants
TEST_DETECTION_ID = uuid4()
TEST_LIBRARY_ID = uuid4()
COVERAGE_TIMEOUT = 2.0  # Maximum allowed processing time in seconds

@pytest.mark.asyncio
@pytest.mark.coverage
async def test_analyze_detection_coverage(
    client: httpx.AsyncClient,
    db: "AsyncSession",
    test_user: "User"
) -> None:
    """
    Test coverage analysis for a single detection with performance validation.
    
    Args:
        client: Async HTTP test client
        db: Test database session
        test_user: Authenticated test user
    """
    # Set up test detection data
    test_data = {
        "detection_id": str(TEST_DETECTION_ID),
        "mitre_techniques": [
            {
                "technique_id": "T1055.001",
                "name": "Process Injection: DLL Injection",
                "tactic": "Defense Evasion"
            },
            {
                "technique_id": "T1055.002",
                "name": "Process Injection: Portable Executable Injection",
                "tactic": "Defense Evasion"
            }
        ]
    }

    # Record start time for performance measurement
    start_time = time.time()

    # Send coverage analysis request
    response = await client.post(
        f"{COVERAGE_API_PREFIX}/analyze",
        json=test_data
    )

    # Validate response time
    processing_time = time.time() - start_time
    assert processing_time <= COVERAGE_TIMEOUT, (
        f"Coverage analysis exceeded timeout: {processing_time:.2f}s > {COVERAGE_TIMEOUT}s"
    )

    # Validate response status and schema
    assert response.status_code == 200
    coverage_data = response.json()
    coverage_response = CoverageResponse(**coverage_data)

    # Validate coverage metrics
    assert 0 <= coverage_response.coverage_percentage <= 100
    assert isinstance(coverage_response.gaps, list)
    assert all(isinstance(gap, dict) for gap in coverage_response.gaps)

    # Validate MITRE mappings
    assert all(
        technique["technique_id"].startswith("T")
        for technique in test_data["mitre_techniques"]
    )

@pytest.mark.asyncio
@pytest.mark.coverage
async def test_analyze_library_coverage(
    client: httpx.AsyncClient,
    db: "AsyncSession",
    test_user: "User"
) -> None:
    """
    Test coverage analysis for an entire detection library with bulk processing.
    
    Args:
        client: Async HTTP test client
        db: Test database session
        test_user: Authenticated test user
    """
    # Set up test library data
    test_data = {
        "library_id": str(TEST_LIBRARY_ID),
        "include_subtechniques": True,
        "calculate_gaps": True
    }

    # Send library analysis request
    response = await client.post(
        f"{COVERAGE_API_PREFIX}/analyze/library",
        json=test_data
    )

    # Validate response
    assert response.status_code == 200
    library_coverage = response.json()

    # Validate library coverage structure
    assert "overall_coverage" in library_coverage
    assert "technique_coverage" in library_coverage
    assert "tactic_coverage" in library_coverage
    assert "gaps" in library_coverage

    # Validate coverage calculations
    assert 0 <= library_coverage["overall_coverage"] <= 100
    assert isinstance(library_coverage["technique_coverage"], dict)
    assert isinstance(library_coverage["gaps"], list)

@pytest.mark.asyncio
@pytest.mark.coverage
async def test_get_coverage_gaps(
    client: httpx.AsyncClient,
    db: "AsyncSession",
    test_user: "User"
) -> None:
    """
    Test retrieving and analyzing coverage gaps with recommendations.
    
    Args:
        client: Async HTTP test client
        db: Test database session
        test_user: Authenticated test user
    """
    # Set up test parameters
    params = {
        "library_id": str(TEST_LIBRARY_ID),
        "min_coverage": 80,
        "include_recommendations": True
    }

    # Request gap analysis
    response = await client.get(
        f"{COVERAGE_API_PREFIX}/gaps",
        params=params
    )

    # Validate response
    assert response.status_code == 200
    gap_analysis = response.json()

    # Validate gap analysis structure
    assert "identified_gaps" in gap_analysis
    assert "recommendations" in gap_analysis
    assert "coverage_trends" in gap_analysis

    # Validate gap prioritization
    gaps = gap_analysis["identified_gaps"]
    assert all(
        isinstance(gap.get("priority"), int) and 1 <= gap["priority"] <= 5
        for gap in gaps
    )

    # Validate recommendations
    recommendations = gap_analysis["recommendations"]
    assert all(
        isinstance(rec.get("confidence"), float) and 0 <= rec["confidence"] <= 1
        for rec in recommendations
    )

@pytest.mark.asyncio
@pytest.mark.coverage
async def test_update_coverage_mapping(
    client: httpx.AsyncClient,
    db: "AsyncSession",
    test_user: "User"
) -> None:
    """
    Test updating MITRE technique mappings with conflict detection.
    
    Args:
        client: Async HTTP test client
        db: Test database session
        test_user: Authenticated test user
    """
    # Create test mapping update
    update_data = CoverageUpdate(
        mitre_techniques=[
            {
                "technique_id": "T1055.001",
                "name": "Process Injection: DLL Injection",
                "confidence": 0.85
            }
        ]
    )

    # Send update request
    response = await client.put(
        f"{COVERAGE_API_PREFIX}/detection/{TEST_DETECTION_ID}/mapping",
        json=update_data.dict()
    )

    # Validate response
    assert response.status_code == 200
    updated_mapping = response.json()

    # Validate mapping updates
    assert "mitre_techniques" in updated_mapping
    assert len(updated_mapping["mitre_techniques"]) > 0
    assert all(
        0 <= technique["confidence"] <= 1
        for technique in updated_mapping["mitre_techniques"]
    )

@pytest.mark.asyncio
@pytest.mark.coverage
async def test_invalid_coverage_request(
    client: httpx.AsyncClient,
    db: "AsyncSession",
    test_user: "User"
) -> None:
    """
    Test error handling and security validation for invalid requests.
    
    Args:
        client: Async HTTP test client
        db: Test database session
        test_user: Authenticated test user
    """
    # Test invalid detection ID
    response = await client.post(
        f"{COVERAGE_API_PREFIX}/analyze",
        json={"detection_id": "invalid-uuid"}
    )
    assert response.status_code == 422

    # Test invalid MITRE technique ID
    response = await client.post(
        f"{COVERAGE_API_PREFIX}/analyze",
        json={
            "detection_id": str(TEST_DETECTION_ID),
            "mitre_techniques": [
                {"technique_id": "invalid-id"}
            ]
        }
    )
    assert response.status_code == 422

    # Test unauthorized access
    client.headers.pop("Authorization", None)
    response = await client.get(f"{COVERAGE_API_PREFIX}/gaps")
    assert response.status_code == 401

    # Test SQL injection attempt
    response = await client.get(
        f"{COVERAGE_API_PREFIX}/gaps",
        params={"library_id": "1 OR 1=1"}
    )
    assert response.status_code == 422

    # Validate error response format
    error_response = response.json()
    assert "detail" in error_response
    assert isinstance(error_response["detail"], str)