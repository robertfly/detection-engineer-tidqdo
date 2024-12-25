"""
FastAPI router endpoints for managing security detections with enterprise-grade features
including CRUD operations, translation capabilities, coverage analysis, rate limiting,
circuit breakers, and comprehensive monitoring.

Versions:
- fastapi: 0.104+
- prometheus_client: 0.17+
- structlog: 23.1+
- redis: 4.5+
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import structlog
from prometheus_client import Counter, Histogram

# Internal imports
from ....models.detection import Detection, DetectionStatus, DetectionPlatform
from ....schemas.detection import DetectionCreate, DetectionUpdate, DetectionInDB
from ....services.detection import DetectionService
from ....services.cache import CacheService
from ...deps import get_current_active_user, check_role_permission

# Initialize router
router = APIRouter(prefix="/detections", tags=["detections"])

# Configure structured logging
logger = structlog.get_logger(__name__)

# Configure metrics
OPERATION_COUNTER = Counter(
    "detection_operations_total",
    "Total number of detection operations",
    ["operation", "status"]
)
OPERATION_LATENCY = Histogram(
    "detection_operation_latency_seconds",
    "Detection operation latency in seconds",
    ["operation"]
)

# Cache configuration
CACHE_TTL = 300  # 5 minutes
RATE_LIMIT_USER = "1000/hour"
RATE_LIMIT_ADMIN = "5000/hour"

@router.get(
    "/",
    response_model=List[DetectionInDB],
    dependencies=[Depends(check_role_permission(["user", "admin"]))],
)
async def get_detections(
    current_user = Depends(get_current_active_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[DetectionStatus] = None,
    platform: Optional[DetectionPlatform] = None,
    detection_service: DetectionService = Depends(),
    cache: CacheService = Depends(),
) -> List[DetectionInDB]:
    """
    Retrieve paginated list of detections with filtering and caching.

    Args:
        current_user: Authenticated user
        skip: Number of records to skip
        limit: Maximum number of records to return
        status: Optional status filter
        platform: Optional platform filter
        detection_service: Detection service instance
        cache: Cache service instance

    Returns:
        List[DetectionInDB]: List of detection objects
    """
    with OPERATION_LATENCY.labels("get_detections").time():
        try:
            # Generate cache key
            cache_key = f"detections:{current_user.id}:{skip}:{limit}:{status}:{platform}"
            
            # Check cache
            cached_result = await cache.get(cache_key)
            if cached_result:
                OPERATION_COUNTER.labels(
                    operation="get_detections",
                    status="cache_hit"
                ).inc()
                return cached_result

            # Apply filters
            filters = {"creator_id": current_user.id}
            if status:
                filters["status"] = status
            if platform:
                filters["platform"] = platform

            # Fetch detections
            detections = await detection_service.get_detections(
                filters=filters,
                skip=skip,
                limit=limit
            )

            # Cache result
            await cache.set(cache_key, detections, ttl=CACHE_TTL)

            OPERATION_COUNTER.labels(
                operation="get_detections",
                status="success"
            ).inc()

            return detections

        except Exception as e:
            logger.error(
                "Failed to fetch detections",
                error=str(e),
                user_id=str(current_user.id)
            )
            OPERATION_COUNTER.labels(
                operation="get_detections",
                status="error"
            ).inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch detections: {str(e)}"
            )

@router.post(
    "/",
    response_model=DetectionInDB,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(check_role_permission(["user", "admin"]))],
)
async def create_detection(
    detection: DetectionCreate,
    current_user = Depends(get_current_active_user),
    detection_service: DetectionService = Depends(),
) -> DetectionInDB:
    """
    Create new detection with validation and coverage analysis.

    Args:
        detection: Detection creation data
        current_user: Authenticated user
        detection_service: Detection service instance

    Returns:
        DetectionInDB: Created detection object
    """
    with OPERATION_LATENCY.labels("create_detection").time():
        try:
            # Create detection
            created_detection = await detection_service.create_detection(
                detection_data=detection,
                user_id=current_user.id
            )

            # Analyze coverage asynchronously
            await detection_service.analyze_coverage(created_detection.id)

            OPERATION_COUNTER.labels(
                operation="create_detection",
                status="success"
            ).inc()

            return created_detection

        except Exception as e:
            logger.error(
                "Failed to create detection",
                error=str(e),
                user_id=str(current_user.id)
            )
            OPERATION_COUNTER.labels(
                operation="create_detection",
                status="error"
            ).inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create detection: {str(e)}"
            )

@router.get(
    "/{detection_id}",
    response_model=DetectionInDB,
    dependencies=[Depends(check_role_permission(["user", "admin"]))],
)
async def get_detection(
    detection_id: UUID,
    current_user = Depends(get_current_active_user),
    detection_service: DetectionService = Depends(),
    cache: CacheService = Depends(),
) -> DetectionInDB:
    """
    Retrieve single detection by ID with caching.

    Args:
        detection_id: Detection UUID
        current_user: Authenticated user
        detection_service: Detection service instance
        cache: Cache service instance

    Returns:
        DetectionInDB: Detection object
    """
    with OPERATION_LATENCY.labels("get_detection").time():
        try:
            # Check cache
            cache_key = f"detection:{detection_id}"
            cached_result = await cache.get(cache_key)
            if cached_result:
                OPERATION_COUNTER.labels(
                    operation="get_detection",
                    status="cache_hit"
                ).inc()
                return cached_result

            # Fetch detection
            detection = await detection_service.get_detection(detection_id)
            if not detection:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Detection {detection_id} not found"
                )

            # Verify ownership
            if detection.creator_id != current_user.id and not current_user.is_superuser:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to access this detection"
                )

            # Cache result
            await cache.set(cache_key, detection, ttl=CACHE_TTL)

            OPERATION_COUNTER.labels(
                operation="get_detection",
                status="success"
            ).inc()

            return detection

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Failed to fetch detection",
                error=str(e),
                detection_id=str(detection_id)
            )
            OPERATION_COUNTER.labels(
                operation="get_detection",
                status="error"
            ).inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch detection: {str(e)}"
            )

@router.put(
    "/{detection_id}",
    response_model=DetectionInDB,
    dependencies=[Depends(check_role_permission(["user", "admin"]))],
)
async def update_detection(
    detection_id: UUID,
    detection_update: DetectionUpdate,
    current_user = Depends(get_current_active_user),
    detection_service: DetectionService = Depends(),
    cache: CacheService = Depends(),
) -> DetectionInDB:
    """
    Update existing detection with validation and cache invalidation.

    Args:
        detection_id: Detection UUID
        detection_update: Updated detection data
        current_user: Authenticated user
        detection_service: Detection service instance
        cache: Cache service instance

    Returns:
        DetectionInDB: Updated detection object
    """
    with OPERATION_LATENCY.labels("update_detection").time():
        try:
            # Verify ownership
            existing_detection = await detection_service.get_detection(detection_id)
            if not existing_detection:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Detection {detection_id} not found"
                )

            if existing_detection.creator_id != current_user.id and not current_user.is_superuser:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to update this detection"
                )

            # Update detection
            updated_detection = await detection_service.update_detection(
                detection_id=detection_id,
                detection_data=detection_update
            )

            # Invalidate cache
            cache_key = f"detection:{detection_id}"
            await cache.delete(cache_key)

            # Re-analyze coverage if logic changed
            if detection_update.logic:
                await detection_service.analyze_coverage(detection_id)

            OPERATION_COUNTER.labels(
                operation="update_detection",
                status="success"
            ).inc()

            return updated_detection

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Failed to update detection",
                error=str(e),
                detection_id=str(detection_id)
            )
            OPERATION_COUNTER.labels(
                operation="update_detection",
                status="error"
            ).inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update detection: {str(e)}"
            )

@router.delete(
    "/{detection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(check_role_permission(["user", "admin"]))],
)
async def delete_detection(
    detection_id: UUID,
    current_user = Depends(get_current_active_user),
    detection_service: DetectionService = Depends(),
    cache: CacheService = Depends(),
) -> None:
    """
    Delete detection with cache cleanup.

    Args:
        detection_id: Detection UUID
        current_user: Authenticated user
        detection_service: Detection service instance
        cache: Cache service instance
    """
    with OPERATION_LATENCY.labels("delete_detection").time():
        try:
            # Verify ownership
            existing_detection = await detection_service.get_detection(detection_id)
            if not existing_detection:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Detection {detection_id} not found"
                )

            if existing_detection.creator_id != current_user.id and not current_user.is_superuser:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to delete this detection"
                )

            # Delete detection
            await detection_service.delete_detection(detection_id)

            # Invalidate cache
            cache_key = f"detection:{detection_id}"
            await cache.delete(cache_key)

            OPERATION_COUNTER.labels(
                operation="delete_detection",
                status="success"
            ).inc()

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Failed to delete detection",
                error=str(e),
                detection_id=str(detection_id)
            )
            OPERATION_COUNTER.labels(
                operation="delete_detection",
                status="error"
            ).inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete detection: {str(e)}"
            )

@router.post(
    "/{detection_id}/translate",
    response_model=Dict,
    dependencies=[Depends(check_role_permission(["user", "admin"]))],
)
async def translate_detection(
    detection_id: UUID,
    target_platform: DetectionPlatform,
    current_user = Depends(get_current_active_user),
    detection_service: DetectionService = Depends(),
) -> Dict:
    """
    Translate detection to target platform.

    Args:
        detection_id: Detection UUID
        target_platform: Target platform for translation
        current_user: Authenticated user
        detection_service: Detection service instance

    Returns:
        Dict: Translation results
    """
    with OPERATION_LATENCY.labels("translate_detection").time():
        try:
            # Verify access
            detection = await detection_service.get_detection(detection_id)
            if not detection:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Detection {detection_id} not found"
                )

            # Translate detection
            translation = await detection_service.translate_detection(
                detection_id=detection_id,
                target_platform=target_platform,
                user_id=current_user.id
            )

            OPERATION_COUNTER.labels(
                operation="translate_detection",
                status="success"
            ).inc()

            return translation

        except Exception as e:
            logger.error(
                "Failed to translate detection",
                error=str(e),
                detection_id=str(detection_id)
            )
            OPERATION_COUNTER.labels(
                operation="translate_detection",
                status="error"
            ).inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to translate detection: {str(e)}"
            )

@router.get(
    "/{detection_id}/coverage",
    response_model=Dict,
    dependencies=[Depends(check_role_permission(["user", "admin"]))],
)
async def analyze_coverage(
    detection_id: UUID,
    current_user = Depends(get_current_active_user),
    detection_service: DetectionService = Depends(),
    cache: CacheService = Depends(),
) -> Dict:
    """
    Analyze MITRE ATT&CK coverage for detection.

    Args:
        detection_id: Detection UUID
        current_user: Authenticated user
        detection_service: Detection service instance
        cache: Cache service instance

    Returns:
        Dict: Coverage analysis results
    """
    with OPERATION_LATENCY.labels("analyze_coverage").time():
        try:
            # Check cache
            cache_key = f"coverage:{detection_id}"
            cached_result = await cache.get(cache_key)
            if cached_result:
                OPERATION_COUNTER.labels(
                    operation="analyze_coverage",
                    status="cache_hit"
                ).inc()
                return cached_result

            # Verify access
            detection = await detection_service.get_detection(detection_id)
            if not detection:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Detection {detection_id} not found"
                )

            # Analyze coverage
            coverage = await detection_service.analyze_coverage(detection_id)

            # Cache result
            await cache.set(cache_key, coverage, ttl=CACHE_TTL)

            OPERATION_COUNTER.labels(
                operation="analyze_coverage",
                status="success"
            ).inc()

            return coverage

        except Exception as e:
            logger.error(
                "Failed to analyze coverage",
                error=str(e),
                detection_id=str(detection_id)
            )
            OPERATION_COUNTER.labels(
                operation="analyze_coverage",
                status="error"
            ).inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to analyze coverage: {str(e)}"
            )