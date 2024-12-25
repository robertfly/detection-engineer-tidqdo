"""
FastAPI router endpoints for intelligence processing, providing REST API interfaces for
uploading, processing, and managing threat intelligence from various sources.

Versions:
- fastapi: 0.104+
- pydantic: 2.0+
- python-multipart: 0.0.6+
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, UploadFile, Depends, status
from typing import Dict, Optional
import logging
from uuid import UUID
import time

# Internal imports
from ....services.intelligence import IntelligenceService
from ....schemas.intelligence import IntelligenceCreate, IntelligenceInDB
from ....core.security import RateLimiter
from ....core.logging import get_logger

# Initialize router with prefix and tags
router = APIRouter(prefix="/intelligence", tags=["intelligence"])

# Initialize services and utilities
intelligence_service = IntelligenceService()
rate_limiter = RateLimiter(rate=100, period=3600)  # 100 requests per hour

# Constants from specification
MAX_FILE_SIZE = 52428800  # 50MB in bytes
PROCESSING_TIMEOUT = 120  # 2 minutes timeout

# Initialize logger
logger = get_logger(__name__, {"service": "intelligence_api"})

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=Dict)
async def create_intelligence(
    intelligence: IntelligenceCreate,
    file: Optional[UploadFile] = None,
    background_tasks: BackgroundTasks = None,
    request: Request = None,
    current_user: Dict = Depends(get_current_user)
) -> Dict:
    """
    Create and process new intelligence with enhanced validation and background processing.
    
    Args:
        intelligence: Intelligence creation request
        file: Optional file upload for PDF/image processing
        background_tasks: FastAPI background tasks
        request: FastAPI request object
        current_user: Current authenticated user
        
    Returns:
        Dict: Created intelligence record with processing status
        
    Raises:
        HTTPException: For validation or processing errors
    """
    try:
        # Check rate limits
        await rate_limiter.check_rate_limit(request)
        
        # Validate file if provided
        if file:
            if file.size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE/1048576}MB"
                )
                
            content_type = file.content_type.lower()
            if content_type not in ["application/pdf", "image/png", "image/jpeg"]:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail=f"Unsupported file type: {content_type}"
                )
        
        # Create intelligence record
        intelligence_data = intelligence.dict()
        intelligence_data["creator_id"] = current_user["id"]
        intelligence_data["status"] = "pending"
        
        # Initialize processing options
        processing_options = {
            "timeout": PROCESSING_TIMEOUT,
            "source_type": intelligence.source_type,
            "processing_options": intelligence.source_config or {}
        }
        
        # Add background processing task
        background_tasks.add_task(
            intelligence_service.process_intelligence_async,
            file.file if file else intelligence.source_content,
            intelligence.source_type,
            processing_options
        )
        
        # Return initial response with task ID
        return {
            "id": str(intelligence_data["id"]),
            "status": "pending",
            "message": "Intelligence processing started",
            "estimated_completion_time": PROCESSING_TIMEOUT
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Intelligence creation failed",
            error=str(e),
            intelligence_data=intelligence.dict(exclude={"source_content"})
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create intelligence"
        )

@router.get("/{intelligence_id}", response_model=Dict)
async def get_intelligence(
    intelligence_id: UUID,
    request: Request,
    current_user: Dict = Depends(get_current_user)
) -> Dict:
    """
    Retrieve intelligence record with processing metrics.
    
    Args:
        intelligence_id: UUID of intelligence record
        request: FastAPI request object
        current_user: Current authenticated user
        
    Returns:
        Dict: Intelligence record with processing results
        
    Raises:
        HTTPException: For validation or access errors
    """
    try:
        # Check rate limits
        await rate_limiter.check_rate_limit(request)
        
        # Retrieve intelligence record
        intelligence = await intelligence_service.get_intelligence(
            intelligence_id=intelligence_id,
            user_id=current_user["id"]
        )
        
        if not intelligence:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Intelligence record not found"
            )
            
        # Check access permissions
        if (intelligence.creator_id != current_user["id"] and 
            current_user["role"] not in ["admin", "analyst"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this intelligence"
            )
        
        # Add cache headers for successful responses
        response_data = intelligence.dict()
        response_data["cache_control"] = "private, max-age=300"  # 5 minute cache
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Intelligence retrieval failed",
            error=str(e),
            intelligence_id=str(intelligence_id)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve intelligence"
        )