"""
FastAPI router endpoints for managing detection libraries with comprehensive security controls,
audit logging, and performance optimization for enterprise-grade library management.

Versions:
- fastapi: 0.104+
- sqlalchemy: 2.0+
- fastapi-cache: 0.1.0+
"""

# External imports - versions specified for security tracking
from fastapi import APIRouter, Depends, HTTPException, Query, Path, BackgroundTasks
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional, Dict
from fastapi_cache.decorator import cache
import logging
from datetime import datetime

# Internal imports
from ....models.library import Library, LibraryVisibility
from ....schemas.library import LibraryCreate, LibraryUpdate, LibraryInDB
from ...deps import get_current_active_user, check_role_permission
from ....core.logging import get_logger

# Initialize router with prefix and tags
router = APIRouter(prefix="/libraries", tags=["libraries"])

# Configure logging
logger = get_logger(__name__, {"module": "libraries_api"})

# Constants
CACHE_TTL = 300  # Cache TTL in seconds
MAX_PAGE_SIZE = 100  # Maximum page size for pagination

@router.get("/", response_model=Dict[str, List[LibraryInDB]])
@cache(expire=CACHE_TTL)
async def get_libraries(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
    visibility: Optional[str] = Query(None, description="Filter by visibility level"),
    organization_id: Optional[UUID] = Query(None, description="Filter by organization"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE, description="Page size"),
    sort_by: Optional[str] = Query("created_at", description="Sort field"),
    order: Optional[str] = Query("desc", description="Sort order")
) -> Dict:
    """
    Get paginated list of libraries with visibility and organization filtering.
    Implements caching and security controls based on user role and organization.
    
    Args:
        db: Database session
        current_user: Authenticated user from dependency
        visibility: Optional visibility filter
        organization_id: Optional organization filter
        skip: Pagination offset
        limit: Page size
        sort_by: Sort field
        order: Sort direction
        
    Returns:
        Dict containing libraries list and metadata
    """
    try:
        # Build base query with joins
        query = db.query(Library)

        # Apply visibility filter based on user role
        if current_user.role != "admin":
            visibility_filters = [Library.visibility == LibraryVisibility.public]
            
            if current_user.organization_id:
                visibility_filters.extend([
                    Library.organization_id == current_user.organization_id,
                    Library.visibility == LibraryVisibility.organization
                ])
                
            query = query.filter(*visibility_filters)

        # Apply additional filters
        if visibility:
            query = query.filter(Library.visibility == LibraryVisibility[visibility])
        if organization_id:
            query = query.filter(Library.organization_id == organization_id)

        # Apply sorting
        sort_field = getattr(Library, sort_by, Library.created_at)
        query = query.order_by(sort_field.desc() if order == "desc" else sort_field.asc())

        # Execute query with pagination
        total = query.count()
        libraries = query.offset(skip).limit(limit).all()

        # Transform results
        library_list = [
            LibraryInDB.from_orm(lib).dict() for lib in libraries
        ]

        logger.info(
            f"Retrieved {len(library_list)} libraries",
            extra={
                "user_id": str(current_user.id),
                "filters": {
                    "visibility": visibility,
                    "organization_id": str(organization_id) if organization_id else None
                }
            }
        )

        return {
            "items": library_list,
            "total": total,
            "page": skip // limit + 1,
            "pages": (total + limit - 1) // limit
        }

    except Exception as e:
        logger.error(
            f"Error retrieving libraries: {str(e)}",
            extra={"user_id": str(current_user.id)}
        )
        raise HTTPException(
            status_code=500,
            detail="Error retrieving libraries"
        )

@router.post("/", response_model=LibraryInDB)
async def create_library(
    db: Session = Depends(get_db),
    library_in: LibraryCreate = None,
    current_user = Depends(get_current_active_user),
    background_tasks: BackgroundTasks = None,
    _: bool = Depends(check_role_permission(["admin", "enterprise"]))
) -> Dict:
    """
    Create new library with security controls and audit logging.
    Implements comprehensive validation and background task processing.
    
    Args:
        db: Database session
        library_in: Library creation schema
        current_user: Authenticated user from dependency
        background_tasks: Background tasks handler
        
    Returns:
        Created library data
    """
    try:
        # Validate organization access
        if library_in.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=403,
                detail="Cannot create library for different organization"
            )

        # Create library instance
        library = Library(
            name=library_in.name,
            organization_id=library_in.organization_id,
            visibility=library_in.visibility,
            description=library_in.description,
            settings=library_in.settings
        )

        # Add to database with retry logic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                db.add(library)
                db.commit()
                db.refresh(library)
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
                db.rollback()

        # Schedule audit log creation
        if background_tasks:
            background_tasks.add_task(
                create_audit_log,
                db=db,
                user_id=current_user.id,
                library_id=library.id,
                action="create_library"
            )

        logger.info(
            f"Created library {library.id}",
            extra={
                "user_id": str(current_user.id),
                "library_id": str(library.id),
                "organization_id": str(library.organization_id)
            }
        )

        return LibraryInDB.from_orm(library)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error creating library: {str(e)}",
            extra={"user_id": str(current_user.id)}
        )
        raise HTTPException(
            status_code=500,
            detail="Error creating library"
        )

async def create_audit_log(
    db: Session,
    user_id: UUID,
    library_id: UUID,
    action: str
) -> None:
    """Background task to create audit log entry."""
    try:
        # Create audit log entry
        audit_log = {
            "user_id": str(user_id),
            "library_id": str(library_id),
            "action": action,
            "timestamp": datetime.utcnow().isoformat(),
            "details": {
                "action_type": "library_management",
                "operation": action
            }
        }
        
        # Log audit event
        logger.info(
            f"Library audit event: {action}",
            extra=audit_log
        )
        
    except Exception as e:
        logger.error(
            f"Error creating audit log: {str(e)}",
            extra={
                "user_id": str(user_id),
                "library_id": str(library_id)
            }
        )