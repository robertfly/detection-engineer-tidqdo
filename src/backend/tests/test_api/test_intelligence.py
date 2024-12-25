# External imports - versions specified for security tracking
import pytest  # pytest v7.0+
import pytest_asyncio  # pytest_asyncio v0.21+
import httpx  # httpx v0.24+
from datetime import datetime, timedelta
from pathlib import Path
import json
from typing import Dict, Any
import asyncio

# Internal imports
from ...app.schemas.intelligence import IntelligenceCreate, IntelligenceUpdate
from ...app.models.intelligence import IntelligenceSourceType, IntelligenceStatus, ACCURACY_THRESHOLDS

class TestIntelligenceAPI:
    """Test class for intelligence API endpoints and processing functionality."""
    
    def __init__(self):
        """Initialize test configuration and resources."""
        self.base_url = "/api/v1/intelligence"
        self.test_pdf_path = Path("tests/test_data/test_document.pdf")
        self.test_url = "https://test.example.com/threat-report"
        self.timeout_seconds = 120  # 2 minute timeout per spec
        self.test_data = {
            "name": "Test Intelligence",
            "description": "Test intelligence processing",
            "source_type": IntelligenceSourceType.pdf.value,
            "metadata": {
                "classification": "public",
                "priority": "medium"
            }
        }

    @pytest.mark.asyncio
    async def test_create_intelligence_pdf(
        self,
        test_client: httpx.AsyncClient,
        test_user: Any,
        tmp_path: Path
    ) -> None:
        """
        Test PDF intelligence creation and processing with accuracy validation.
        
        Args:
            test_client: Async HTTP test client
            test_user: Test user fixture
            tmp_path: Temporary path fixture
        """
        # Prepare test PDF file
        test_pdf = tmp_path / "test.pdf"
        test_pdf.write_bytes(b"Test PDF content")
        
        # Create multipart form data
        files = {
            "file": ("test.pdf", test_pdf.open("rb"), "application/pdf")
        }
        data = {
            "source_type": IntelligenceSourceType.pdf.value,
            "name": "Test PDF Intelligence",
            "creator_id": str(test_user.id)
        }
        
        # Submit intelligence creation request
        response = await test_client.post(
            f"{self.base_url}/",
            data=data,
            files=files
        )
        
        # Verify creation response
        assert response.status_code == 201
        intel_id = response.json()["id"]
        
        # Track processing time
        start_time = datetime.utcnow()
        processing_complete = False
        
        # Poll processing status
        while datetime.utcnow() - start_time < timedelta(seconds=self.timeout_seconds):
            status_response = await test_client.get(f"{self.base_url}/{intel_id}")
            assert status_response.status_code == 200
            
            status_data = status_response.json()
            if status_data["status"] == IntelligenceStatus.completed.value:
                processing_complete = True
                break
            elif status_data["status"] == IntelligenceStatus.failed.value:
                raise AssertionError(f"Processing failed: {status_data.get('error_message')}")
                
            await asyncio.sleep(2)
            
        # Verify processing completed within timeout
        assert processing_complete, f"Processing did not complete within {self.timeout_seconds} seconds"
        
        # Verify processing accuracy meets threshold
        final_response = await test_client.get(f"{self.base_url}/{intel_id}")
        final_data = final_response.json()
        assert final_data["processing_accuracy"] >= ACCURACY_THRESHOLDS[IntelligenceSourceType.pdf]

    @pytest.mark.asyncio
    async def test_create_intelligence_url(
        self,
        test_client: httpx.AsyncClient,
        test_user: Any
    ) -> None:
        """
        Test URL intelligence creation and processing with content capture validation.
        
        Args:
            test_client: Async HTTP test client
            test_user: Test user fixture
        """
        # Prepare URL intelligence request
        data = {
            "source_type": IntelligenceSourceType.url.value,
            "name": "Test URL Intelligence",
            "creator_id": str(test_user.id),
            "source_url": self.test_url,
            "source_config": {
                "max_depth": 1,
                "timeout_seconds": 30
            }
        }
        
        # Submit intelligence creation request
        response = await test_client.post(
            f"{self.base_url}/",
            json=data
        )
        
        # Verify creation response
        assert response.status_code == 201
        intel_id = response.json()["id"]
        
        # Track processing time
        start_time = datetime.utcnow()
        processing_complete = False
        
        # Poll processing status
        while datetime.utcnow() - start_time < timedelta(seconds=self.timeout_seconds):
            status_response = await test_client.get(f"{self.base_url}/{intel_id}")
            assert status_response.status_code == 200
            
            status_data = status_response.json()
            if status_data["status"] == IntelligenceStatus.completed.value:
                processing_complete = True
                break
            elif status_data["status"] == IntelligenceStatus.failed.value:
                raise AssertionError(f"Processing failed: {status_data.get('error_message')}")
                
            await asyncio.sleep(2)
            
        # Verify processing completed within timeout
        assert processing_complete, f"Processing did not complete within {self.timeout_seconds} seconds"
        
        # Verify content capture rate meets threshold
        final_response = await test_client.get(f"{self.base_url}/{intel_id}")
        final_data = final_response.json()
        assert final_data["processing_accuracy"] >= ACCURACY_THRESHOLDS[IntelligenceSourceType.url]

    @pytest.mark.asyncio
    @pytest.mark.performance
    async def test_processing_metrics(
        self,
        test_client: httpx.AsyncClient,
        test_user: Any
    ) -> None:
        """
        Test intelligence processing performance metrics and accuracy requirements.
        
        Args:
            test_client: Async HTTP test client
            test_user: Test user fixture
        """
        # Test data for different source types
        test_cases = [
            {
                "source_type": IntelligenceSourceType.pdf.value,
                "name": "PDF Test",
                "threshold": ACCURACY_THRESHOLDS[IntelligenceSourceType.pdf]
            },
            {
                "source_type": IntelligenceSourceType.url.value,
                "name": "URL Test",
                "threshold": ACCURACY_THRESHOLDS[IntelligenceSourceType.url]
            }
        ]
        
        processing_times = []
        accuracy_scores = []
        
        for test_case in test_cases:
            # Create intelligence item
            data = {
                **test_case,
                "creator_id": str(test_user.id),
                "metadata": {"test": "performance"}
            }
            
            response = await test_client.post(
                f"{self.base_url}/",
                json=data
            )
            assert response.status_code == 201
            intel_id = response.json()["id"]
            
            # Track processing time
            start_time = datetime.utcnow()
            processing_complete = False
            
            # Poll until complete
            while datetime.utcnow() - start_time < timedelta(seconds=self.timeout_seconds):
                status_response = await test_client.get(f"{self.base_url}/{intel_id}")
                status_data = status_response.json()
                
                if status_data["status"] == IntelligenceStatus.completed.value:
                    processing_complete = True
                    processing_time = (datetime.utcnow() - start_time).total_seconds()
                    processing_times.append(processing_time)
                    accuracy_scores.append(status_data["processing_accuracy"])
                    break
                    
                await asyncio.sleep(2)
                
            assert processing_complete, f"Processing timeout for {test_case['source_type']}"
        
        # Verify performance metrics
        avg_processing_time = sum(processing_times) / len(processing_times)
        assert avg_processing_time <= self.timeout_seconds, "Average processing time exceeds limit"
        
        # Verify accuracy metrics
        for idx, test_case in enumerate(test_cases):
            assert accuracy_scores[idx] >= test_case["threshold"], \
                f"Accuracy below threshold for {test_case['source_type']}"

    @pytest.mark.asyncio
    async def test_error_handling(
        self,
        test_client: httpx.AsyncClient,
        test_user: Any
    ) -> None:
        """
        Test intelligence processing error scenarios and handling.
        
        Args:
            test_client: Async HTTP test client
            test_user: Test user fixture
        """
        # Test invalid file format
        data = {
            "source_type": IntelligenceSourceType.pdf.value,
            "name": "Invalid File Test",
            "creator_id": str(test_user.id)
        }
        files = {
            "file": ("test.txt", b"Invalid content", "text/plain")
        }
        response = await test_client.post(
            f"{self.base_url}/",
            data=data,
            files=files
        )
        assert response.status_code == 400
        assert "Invalid file format" in response.json()["detail"]
        
        # Test invalid URL
        data = {
            "source_type": IntelligenceSourceType.url.value,
            "name": "Invalid URL Test",
            "creator_id": str(test_user.id),
            "source_url": "invalid-url"
        }
        response = await test_client.post(
            f"{self.base_url}/",
            json=data
        )
        assert response.status_code == 400
        assert "Invalid URL format" in response.json()["detail"]
        
        # Test processing timeout
        data = {
            "source_type": IntelligenceSourceType.pdf.value,
            "name": "Timeout Test",
            "creator_id": str(test_user.id),
            "source_config": {
                "timeout_seconds": 1  # Force timeout
            }
        }
        response = await test_client.post(
            f"{self.base_url}/",
            json=data
        )
        assert response.status_code == 201
        intel_id = response.json()["id"]
        
        # Wait for processing to fail
        await asyncio.sleep(5)
        status_response = await test_client.get(f"{self.base_url}/{intel_id}")
        assert status_response.json()["status"] == IntelligenceStatus.failed.value