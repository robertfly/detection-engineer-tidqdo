"""
FastAPI endpoint module for managing detection coverage analysis, MITRE ATT&CK mapping,
and coverage reporting functionality.

Versions:
- fastapi: 0.104+
- circuitbreaker: 1.4+
- fastapi-cache: 0.1+
"""

from typing import Dict, List, Optional
from uuid import UUID
from datetime import timedelta
import logging
from functools import wraps

# External imports
from fastapi import (
    APIRouter, 
    Depends, 
    HTTPException, 
    Query, 
    Path, 
    BackgroundTasks,
    status
)
from fastapi_cache import FastAPICache
from fastapi_cache.decorator import cache
from circuitbreaker import circuit
from prometheus_client import Counter, Histogram

# Internal imports
from app.services.coverage import CoverageService
from app.core.logging import get_logger
from app.core.auth import require_active_user, inject_db
from app.models.user import User
from app.schemas.coverage import (
    CoverageResponse,
    CoverageGapsResponse,
    LibraryCoverageResponse,
    UpdateMappingRequest
)

# Initialize router with prefix and tags
router = APIRouter(prefix="/coverage", tags=["coverage"])

# Configure logging
logger = get_logger(__name__, {"service": "coverage_api"})

# Global constants
CACHE_TTL = timedelta(minutes=15)
MAX_RETRY_ATTEMPTS = 3

# Prometheus metrics
COVERAGE_REQUEST_DURATION = Histogram(
    'coverage_request_duration_seconds',
    'Time spent processing coverage requests',
    ['endpoint', 'status']
)
COVERAGE_ERRORS = Counter(
    'coverage_errors_total',
    'Total number of coverage analysis errors',
    ['endpoint', 'error_type']
)

def monitor_endpoint(endpoint_name: str):
    """Decorator for monitoring endpoint performance and errors"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with COVERAGE_REQUEST_DURATION.labels(
                endpoint=endpoint_name,
                status="success"
            ).time():
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    COVERAGE_ERRORS.labels(
                        endpoint=endpoint_name,
                        error_type=type(e).__name__
                    ).inc()
                    raise
        return wrapper
    return decorator

@router.post(
    "/{detection_id}/analyze",
    response_model=CoverageResponse,
    status_code=status.HTTP_200_OK,
    description="Analyze coverage for a single detection with caching"
)
@circuit(failure_threshold=5, recovery_timeout=60)
@cache(expire=CACHE_TTL)
@inject_db
@require_active_user
@monitor_endpoint("analyze_detection")
async def analyze_detection_coverage(
    detection_id: UUID = Path(..., description="Detection ID to analyze"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(require_active_user),
    coverage_service: CoverageService = Depends()
) -> Dict:
    """
    Analyze coverage for a single detection with background processing support.
    
    Args:
        detection_id: UUID of detection to analyze
        background_tasks: FastAPI background tasks
        current_user: Authenticated user
        coverage_service: Coverage service instance
        
    Returns:
        Dict containing coverage analysis results
        
    Raises:
        HTTPException: For validation or processing errors
    """
    try:
        logger.info(
            "Starting detection coverage analysis",
            detection_id=str(detection_id),
            user_id=str(current_user.id)
        )

        # Check cache first
        cache_key = f"coverage:detection:{detection_id}"
        cached_result = await FastAPICache.get(cache_key)
        if cached_result:
            return cached_result

        # Analyze coverage
        result = await coverage_service.analyze_detection(
            detection_id=detection_id,
            options={"user_id": str(current_user.id)}
        )

        # Cache successful results
        if result.get("coverage_score", 0) > 0:
            background_tasks.add_task(
                FastAPICache.set,
                cache_key,
                result,
                expire=CACHE_TTL
            )

        return result

    except ValueError as e:
        logger.error(
            "Validation error in coverage analysis",
            error=str(e),
            detection_id=str(detection_id)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "Coverage analysis failed",
            error=str(e),
            detection_id=str(detection_id)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Coverage analysis failed"
        )

@router.post(
    "/library/{library_id}/analyze",
    response_model=LibraryCoverageResponse,
    status_code=status.HTTP_200_OK,
    description="Analyze coverage for an entire detection library"
)
@circuit(failure_threshold=5, recovery_timeout=60)
@inject_db
@require_active_user
@monitor_endpoint("analyze_library")
async def analyze_library_coverage(
    library_id: UUID = Path(..., description="Library ID to analyze"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(require_active_user),
    coverage_service: CoverageService = Depends()
) -> Dict:
    """
    Analyze coverage for an entire detection library with background processing.
    
    Args:
        library_id: UUID of library to analyze
        background_tasks: FastAPI background tasks
        current_user: Authenticated user
        coverage_service: Coverage service instance
        
    Returns:
        Dict containing library coverage analysis
        
    Raises:
        HTTPException: For validation or processing errors
    """
    try:
        logger.info(
            "Starting library coverage analysis",
            library_id=str(library_id),
            user_id=str(current_user.id)
        )

        result = await coverage_service.analyze_library(
            library_id=library_id,
            options={
                "user_id": str(current_user.id),
                "background": True
            }
        )

        # Schedule background processing for long-running analysis
        if result.get("status") == "processing":
            background_tasks.add_task(
                coverage_service.process_library_analysis,
                library_id=library_id,
                result_id=result.get("result_id")
            )

        return result

    except ValueError as e:
        logger.error(
            "Validation error in library analysis",
            error=str(e),
            library_id=str(library_id)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "Library analysis failed",
            error=str(e),
            library_id=str(library_id)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Library analysis failed"
        )

@router.get(
    "/gaps",
    response_model=CoverageGapsResponse,
    status_code=status.HTTP_200_OK,
    description="Get coverage gaps analysis"
)
@cache(expire=CACHE_TTL)
@inject_db
@require_active_user
@monitor_endpoint("get_gaps")
async def get_coverage_gaps(
    library_id: Optional[UUID] = Query(None, description="Optional library filter"),
    technique_ids: Optional[List[str]] = Query(None, description="Optional technique filters"),
    current_user: User = Depends(require_active_user),
    coverage_service: CoverageService = Depends()
) -> Dict:
    """
    Get coverage gaps analysis with optional filtering.
    
    Args:
        library_id: Optional library UUID filter
        technique_ids: Optional list of technique IDs to filter
        current_user: Authenticated user
        coverage_service: Coverage service instance
        
    Returns:
        Dict containing coverage gaps analysis
        
    Raises:
        HTTPException: For validation or processing errors
    """
    try:
        logger.info(
            "Getting coverage gaps analysis",
            library_id=str(library_id) if library_id else None,
            user_id=str(current_user.id)
        )

        result = await coverage_service.get_coverage_gaps(
            library_id=library_id,
            technique_ids=technique_ids,
            options={"user_id": str(current_user.id)}
        )

        return result

    except ValueError as e:
        logger.error(
            "Validation error in gaps analysis",
            error=str(e),
            library_id=str(library_id) if library_id else None
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "Gaps analysis failed",
            error=str(e),
            library_id=str(library_id) if library_id else None
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gaps analysis failed"
        )

@router.put(
    "/{detection_id}/mapping",
    response_model=CoverageResponse,
    status_code=status.HTTP_200_OK,
    description="Update detection MITRE mapping"
)
@inject_db
@require_active_user
@monitor_endpoint("update_mapping")
async def update_coverage_mapping(
    detection_id: UUID = Path(..., description="Detection ID to update"),
    mapping: UpdateMappingRequest = UpdateMappingRequest,
    current_user: User = Depends(require_active_user),
    coverage_service: CoverageService = Depends()
) -> Dict:
    """
    Update MITRE ATT&CK mapping for a detection.
    
    Args:
        detection_id: UUID of detection to update
        mapping: New mapping data
        current_user: Authenticated user
        coverage_service: Coverage service instance
        
    Returns:
        Dict containing updated coverage analysis
        
    Raises:
        HTTPException: For validation or processing errors
    """
    try:
        logger.info(
            "Updating detection mapping",
            detection_id=str(detection_id),
            user_id=str(current_user.id)
        )

        result = await coverage_service.update_detection_mapping(
            detection_id=detection_id,
            mapping_data=mapping.dict(),
            user_id=str(current_user.id)
        )

        # Invalidate related caches
        cache_key = f"coverage:detection:{detection_id}"
        await FastAPICache.delete(cache_key)

        return result

    except ValueError as e:
        logger.error(
            "Validation error in mapping update",
            error=str(e),
            detection_id=str(detection_id)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "Mapping update failed",
            error=str(e),
            detection_id=str(detection_id)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mapping update failed"
        )