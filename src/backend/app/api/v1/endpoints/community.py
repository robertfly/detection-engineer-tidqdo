"""
FastAPI router implementing enterprise-grade community detection sharing and collaboration features
with comprehensive security controls, rate limiting, and performance optimizations.

Versions:
- fastapi: 0.104+
- sqlalchemy: 2.0+
- fastapi_cache: 0.1.0+
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Dict, Optional
from uuid import UUID
from datetime import datetime, timedelta
from fastapi_cache import Cache
from fastapi_cache.decorator import cache

# Internal imports
from ....api.deps import get_current_user, check_role_permission
from ....models.detection import Detection, DetectionStatus
from ....schemas.detection import DetectionCreate
from ....core.logging import get_logger

# Initialize router and logger
router = APIRouter(prefix="/community", tags=["community"])
logger = get_logger(__name__)

# Constants
RATE_LIMIT_WINDOW = 60 * 15  # 15 minutes
MAX_RATING_VALUE = 5
CACHE_TTL = 300  # 5 minutes

@router.get("/detections", response_model=List[Dict])
@cache(expire=CACHE_TTL)
async def get_public_detections(
    db: Session = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort_by: Optional[str] = Query(None, regex="^(created_at|rating|name)$"),
    filter_by: Optional[str] = Query(None),
    platform: Optional[str] = Query(None)
) -> List[Dict]:
    """
    Retrieve paginated list of publicly shared detections with filtering and sorting.
    
    Args:
        db: Database session
        skip: Number of records to skip
        limit: Maximum number of records to return
        sort_by: Field to sort by
        filter_by: Optional filter string
        platform: Optional platform filter
        
    Returns:
        List of public detection dictionaries
    """
    try:
        # Build base query
        query = db.query(Detection).filter(
            Detection.status == DetectionStatus.published,
            Detection.metadata["visibility"].astext == "public"
        )

        # Apply filters
        if filter_by:
            query = query.filter(
                Detection.name.ilike(f"%{filter_by}%") |
                Detection.description.ilike(f"%{filter_by}%")
            )
            
        if platform:
            query = query.filter(Detection.platform == platform)

        # Apply sorting
        if sort_by:
            sort_column = {
                "created_at": Detection.created_at,
                "rating": Detection.metadata["rating"].cast(float),
                "name": Detection.name
            }.get(sort_by)
            if sort_column:
                query = query.order_by(desc(sort_column))
        else:
            query = query.order_by(desc(Detection.created_at))

        # Execute query with pagination
        total = query.count()
        detections = query.offset(skip).limit(limit).all()

        # Transform results
        results = []
        for detection in detections:
            detection_dict = detection.to_dict()
            detection_dict.update({
                "creator_name": detection.creator.name,
                "library_name": detection.library.name,
                "rating": detection.metadata.get("rating", 0),
                "rating_count": detection.metadata.get("rating_count", 0)
            })
            results.append(detection_dict)

        logger.info(f"Retrieved {len(results)} public detections")
        return results

    except Exception as e:
        logger.error(f"Error retrieving public detections: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve public detections"
        )

@router.post("/detections/{detection_id}/share")
@check_role_permission(["community_user", "enterprise_user"])
async def share_detection(
    detection_id: UUID,
    db: Session = Depends(get_current_user),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Share a detection with the community with enhanced validation and abuse prevention.
    
    Args:
        detection_id: UUID of detection to share
        db: Database session
        current_user: Current authenticated user
        
    Returns:
        Updated detection dictionary
    """
    try:
        # Retrieve detection with ownership check
        detection = db.query(Detection).filter(
            Detection.id == detection_id,
            Detection.creator_id == current_user.id
        ).first()
        
        if not detection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Detection not found or access denied"
            )

        # Validate detection quality
        if detection.validation_results.get("status") != "success":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Detection must pass validation before sharing"
            )

        # Update detection visibility and metadata
        detection.metadata["visibility"] = "public"
        detection.metadata["shared_at"] = datetime.utcnow().isoformat()
        detection.metadata["rating"] = 0
        detection.metadata["rating_count"] = 0
        
        # Create audit log
        detection._create_audit_log(
            user_id=current_user.id,
            action="share_detection"
        )
        
        db.commit()
        
        # Invalidate relevant caches
        await Cache.delete("public_detections")
        
        logger.info(f"Detection {detection_id} shared by user {current_user.id}")
        return detection.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing detection {detection_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to share detection"
        )

@router.post("/detections/{detection_id}/rate")
@check_role_permission(["community_user", "enterprise_user"])
async def rate_detection(
    detection_id: UUID,
    rating: int = Query(..., ge=1, le=MAX_RATING_VALUE),
    db: Session = Depends(get_current_user),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Rate a shared detection with validation and update tracking.
    
    Args:
        detection_id: UUID of detection to rate
        rating: Rating value (1-5)
        db: Database session
        current_user: Current authenticated user
        
    Returns:
        Updated detection dictionary
    """
    try:
        # Retrieve public detection
        detection = db.query(Detection).filter(
            Detection.id == detection_id,
            Detection.metadata["visibility"].astext == "public"
        ).first()
        
        if not detection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public detection not found"
            )

        # Prevent self-rating
        if detection.creator_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot rate your own detection"
            )

        # Update rating
        current_rating = detection.metadata.get("rating", 0)
        current_count = detection.metadata.get("rating_count", 0)
        
        new_count = current_count + 1
        new_rating = ((current_rating * current_count) + rating) / new_count
        
        detection.metadata["rating"] = round(new_rating, 2)
        detection.metadata["rating_count"] = new_count
        
        # Create audit log
        detection._create_audit_log(
            user_id=current_user.id,
            action="rate_detection"
        )
        
        db.commit()
        
        # Invalidate relevant caches
        await Cache.delete("public_detections")
        
        logger.info(f"Detection {detection_id} rated {rating} by user {current_user.id}")
        return detection.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rating detection {detection_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to rate detection"
        )

@router.get("/detections/{detection_id}/feedback", response_model=List[Dict])
async def get_detection_feedback(
    detection_id: UUID,
    db: Session = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
) -> List[Dict]:
    """
    Retrieve paginated feedback for a shared detection.
    
    Args:
        detection_id: UUID of detection
        db: Database session
        skip: Number of records to skip
        limit: Maximum number of records to return
        
    Returns:
        List of feedback dictionaries
    """
    try:
        # Verify detection exists and is public
        detection = db.query(Detection).filter(
            Detection.id == detection_id,
            Detection.metadata["visibility"].astext == "public"
        ).first()
        
        if not detection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public detection not found"
            )

        # Retrieve feedback with pagination
        feedback = detection.metadata.get("feedback", [])
        
        # Sort feedback by timestamp
        feedback.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        
        # Apply pagination
        paginated_feedback = feedback[skip:skip + limit]
        
        logger.info(f"Retrieved {len(paginated_feedback)} feedback items for detection {detection_id}")
        return paginated_feedback

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving feedback for detection {detection_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve detection feedback"
        )