# External imports - versions specified for security tracking
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status  # fastapi v0.104+
from sqlalchemy.orm import Session  # sqlalchemy v2.0+
from typing import Dict, Any, List, Optional
from prometheus_client import Counter, Histogram  # prometheus_client v0.17+
from redis import Redis  # redis v4.0+
import logging
from datetime import datetime

# Internal imports
from app.services.translation import TranslationService
from app.schemas.translation import (
    TranslationBase, TranslationCreate, TranslationUpdate, TranslationInDB
)
from app.api.deps import (
    get_current_active_user, get_db, validate_token, check_rate_limit
)
from app.models.user import User
from app.core.logging import get_logger

# Initialize router
router = APIRouter(prefix="/translations", tags=["translations"])

# Configure logging
logger = get_logger(__name__)

# Initialize metrics
TRANSLATION_METRICS = Counter(
    "translation_requests_total",
    "Total translation requests by platform",
    ["platform", "status"]
)
TRANSLATION_LATENCY = Histogram(
    "translation_latency_seconds",
    "Translation request latency",
    ["platform", "operation"]
)

@router.post("/", response_model=TranslationInDB)
@check_rate_limit(limit=100)
async def create_translation(
    translation: TranslationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    background_tasks: BackgroundTasks = None
) -> TranslationInDB:
    """
    Create a new detection rule translation with comprehensive validation.

    Args:
        translation: Translation creation schema
        db: Database session
        current_user: Authenticated user
        background_tasks: Background task queue

    Returns:
        TranslationInDB: Created translation with validation status

    Raises:
        HTTPException: If validation or creation fails
    """
    try:
        # Initialize translation service
        translation_service = TranslationService()

        # Start latency tracking
        with TRANSLATION_LATENCY.labels(
            platform=translation.platform.value,
            operation="create"
        ).time():
            # Validate detection exists and user has access
            detection = db.query(Detection).filter_by(id=translation.detection_id).first()
            if not detection:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Detection not found"
                )

            # Get platform-specific configuration
            platform_config = translation_service.get_platform_config(translation.platform)

            # Perform translation
            translated_result = await translation_service.translate_detection(
                detection=detection.to_dict(),
                target_platform=translation.platform.value,
                options=translation.platform_config
            )

            # Validate translation
            valid, error_msg = await translation_service.validate_translation(
                translated_result,
                translation.platform.value
            )

            if not valid:
                TRANSLATION_METRICS.labels(
                    platform=translation.platform.value,
                    status="failed"
                ).inc()
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Translation validation failed: {error_msg}"
                )

            # Create translation record
            db_translation = Translation(
                detection_id=translation.detection_id,
                platform=translation.platform,
                translated_logic=translated_result,
                creator_id=current_user.id
            )
            db.add(db_translation)
            db.commit()
            db.refresh(db_translation)

            # Update metrics
            TRANSLATION_METRICS.labels(
                platform=translation.platform.value,
                status="success"
            ).inc()

            # Schedule background validation if needed
            if background_tasks:
                background_tasks.add_task(
                    validate_translation_async,
                    db_translation.id,
                    translation.platform.value
                )

            logger.info(
                "Translation created successfully",
                translation_id=str(db_translation.id),
                platform=translation.platform.value
            )

            return TranslationInDB.from_orm(db_translation)

    except Exception as e:
        logger.error(
            "Translation creation failed",
            error=str(e),
            platform=translation.platform.value
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/validate", response_model=Dict[str, Any])
@check_rate_limit(limit=200)
async def validate_translation(
    translation: TranslationBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Validate a detection translation with platform-specific checks.

    Args:
        translation: Translation to validate
        db: Database session
        current_user: Authenticated user

    Returns:
        Dict[str, Any]: Validation results with detailed feedback

    Raises:
        HTTPException: If validation fails
    """
    try:
        # Initialize translation service
        translation_service = TranslationService()

        # Start latency tracking
        with TRANSLATION_LATENCY.labels(
            platform=translation.platform.value,
            operation="validate"
        ).time():
            # Perform validation
            valid, error_msg = await translation_service.validate_translation(
                translation.translated_logic,
                translation.platform.value
            )

            # Calculate validation metrics
            validation_metrics = {
                "timestamp": datetime.utcnow().isoformat(),
                "platform": translation.platform.value,
                "success": valid,
                "error_message": error_msg if not valid else None,
                "validation_details": {
                    "field_coverage": translation_service._calculate_field_coverage(
                        translation.translated_logic
                    ),
                    "query_complexity": translation_service._calculate_query_complexity(
                        translation.translated_logic.get("query", "")
                    )
                }
            }

            # Update metrics
            TRANSLATION_METRICS.labels(
                platform=translation.platform.value,
                status="valid" if valid else "invalid"
            ).inc()

            logger.info(
                "Translation validation completed",
                platform=translation.platform.value,
                success=valid
            )

            return validation_metrics

    except Exception as e:
        logger.error(
            "Translation validation failed",
            error=str(e),
            platform=translation.platform.value
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/{translation_id}", response_model=TranslationInDB)
async def get_translation(
    translation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> TranslationInDB:
    """
    Retrieve a specific translation by ID.

    Args:
        translation_id: Translation UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        TranslationInDB: Translation details

    Raises:
        HTTPException: If translation not found or access denied
    """
    try:
        translation = db.query(Translation).filter_by(id=translation_id).first()
        if not translation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Translation not found"
            )

        # Check access permissions
        if not current_user.is_superuser and translation.creator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

        return TranslationInDB.from_orm(translation)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving translation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get("/", response_model=List[TranslationInDB])
async def list_translations(
    platform: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> List[TranslationInDB]:
    """
    List translations with optional filtering.

    Args:
        platform: Optional platform filter
        status: Optional status filter
        db: Database session
        current_user: Authenticated user

    Returns:
        List[TranslationInDB]: List of matching translations

    Raises:
        HTTPException: If query fails
    """
    try:
        query = db.query(Translation)

        # Apply filters
        if platform:
            query = query.filter(Translation.platform == platform)
        if status:
            query = query.filter(Translation.validation_status == status)

        # Apply user access filter
        if not current_user.is_superuser:
            query = query.filter(Translation.creator_id == current_user.id)

        translations = query.all()
        return [TranslationInDB.from_orm(t) for t in translations]

    except Exception as e:
        logger.error(f"Error listing translations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )