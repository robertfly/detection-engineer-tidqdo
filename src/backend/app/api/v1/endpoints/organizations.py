"""
Organization management router implementing secure CRUD operations with enhanced
role-based access control, audit logging, and data classification.

Version: 1.0.0
"""

# External imports - versions specified for security tracking
from fastapi import APIRouter, Depends, HTTPException, status, Security  # fastapi v0.104+
from sqlalchemy.orm import Session  # sqlalchemy v2.0+
from pydantic import UUID4  # pydantic v2.0+
from fastapi_limiter import RateLimiter  # fastapi-limiter v0.1.5+
from typing import List, Optional
import logging
from datetime import datetime

# Internal imports
from ....models.organization import Organization
from ....schemas.organization import (
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationResponse
)
from ....api.deps import (
    get_current_user,
    get_current_superuser,
    check_role_permission,
    validate_organization_access
)
from ....core.logging import AuditLogger
from ....db.session import get_db

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router with prefix and tags
router = APIRouter(prefix="/organizations", tags=["organizations"])

# Initialize audit logger
audit_logger = AuditLogger()

# Rate limiting configuration
rate_limiter = RateLimiter(key_func=lambda: "organizations", limit=1000, period=3600)

@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Security(check_role_permission(["admin", "enterprise"]))]
)
async def create_organization(
    *,
    db: Session = Depends(get_db),
    organization: OrganizationCreate,
    current_user = Depends(get_current_user)
) -> OrganizationResponse:
    """
    Create new organization with security validation and audit logging.
    
    Args:
        db: Database session
        organization: Organization creation schema
        current_user: Authenticated user making the request
        
    Returns:
        OrganizationResponse: Created organization data
        
    Raises:
        HTTPException: If validation fails or unauthorized
    """
    try:
        # Verify domain for enterprise organizations
        if organization.type == "enterprise" and not organization.domain:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Domain is required for enterprise organizations"
            )

        # Create organization instance
        db_org = Organization(
            name=organization.name,
            description=organization.description,
            type=organization.type,
            domain=organization.domain,
            settings=organization.settings or {},
            data_classification=organization.data_classification
        )

        # Add current user as organization admin
        db_org.add_user(current_user, role="admin")

        # Save to database
        db.add(db_org)
        db.commit()
        db.refresh(db_org)

        # Log audit event
        audit_logger.log_organization_event(
            "create_organization",
            organization_id=str(db_org.id),
            user_id=str(current_user.id),
            details={
                "name": db_org.name,
                "type": db_org.type,
                "classification": str(organization.data_classification)
            }
        )

        logger.info(f"Organization created: {db_org.id} by user {current_user.id}")
        return OrganizationResponse(**db_org.to_dict())

    except Exception as e:
        db.rollback()
        logger.error(f"Organization creation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create organization"
        )

@router.get(
    "/{organization_id}",
    response_model=OrganizationResponse,
    dependencies=[Depends(validate_organization_access)]
)
async def get_organization(
    organization_id: UUID4,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
) -> OrganizationResponse:
    """
    Retrieve organization details with security checks.
    
    Args:
        organization_id: Organization UUID
        db: Database session
        current_user: Authenticated user making the request
        
    Returns:
        OrganizationResponse: Organization data with masked sensitive fields
    """
    try:
        organization = db.query(Organization).filter(
            Organization.id == organization_id
        ).first()

        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        # Log access attempt
        audit_logger.log_organization_event(
            "read_organization",
            organization_id=str(organization_id),
            user_id=str(current_user.id)
        )

        return OrganizationResponse(**organization.to_dict())

    except Exception as e:
        logger.error(f"Organization retrieval failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve organization"
        )

@router.put(
    "/{organization_id}",
    response_model=OrganizationResponse,
    dependencies=[Depends(validate_organization_access)]
)
async def update_organization(
    *,
    organization_id: UUID4,
    organization: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
) -> OrganizationResponse:
    """
    Update organization with security validation and audit trail.
    
    Args:
        organization_id: Organization UUID
        organization: Update schema
        db: Database session
        current_user: Authenticated user making the request
        
    Returns:
        OrganizationResponse: Updated organization data
    """
    try:
        db_org = db.query(Organization).filter(
            Organization.id == organization_id
        ).first()

        if not db_org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        # Update fields
        update_data = organization.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_org, field, value)

        db_org.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_org)

        # Log update event
        audit_logger.log_organization_event(
            "update_organization",
            organization_id=str(organization_id),
            user_id=str(current_user.id),
            details={"updated_fields": list(update_data.keys())}
        )

        return OrganizationResponse(**db_org.to_dict())

    except Exception as e:
        db.rollback()
        logger.error(f"Organization update failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update organization"
        )

@router.delete(
    "/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Security(check_role_permission(["admin"]))]
)
async def delete_organization(
    organization_id: UUID4,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
) -> None:
    """
    Delete organization with security validation and audit logging.
    
    Args:
        organization_id: Organization UUID
        db: Database session
        current_user: Authenticated user making the request
    """
    try:
        organization = db.query(Organization).filter(
            Organization.id == organization_id
        ).first()

        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        # Log deletion event before deleting
        audit_logger.log_organization_event(
            "delete_organization",
            organization_id=str(organization_id),
            user_id=str(current_user.id),
            details={"name": organization.name}
        )

        db.delete(organization)
        db.commit()

    except Exception as e:
        db.rollback()
        logger.error(f"Organization deletion failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete organization"
        )

@router.get(
    "/",
    response_model=List[OrganizationResponse],
    dependencies=[Depends(rate_limiter)]
)
async def list_organizations(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
) -> List[OrganizationResponse]:
    """
    List organizations with pagination and security filtering.
    
    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        db: Database session
        current_user: Authenticated user making the request
        
    Returns:
        List[OrganizationResponse]: List of organizations
    """
    try:
        # Apply security filtering based on user role
        query = db.query(Organization)
        
        if not current_user.is_superuser:
            query = query.filter(Organization.users.any(id=current_user.id))

        organizations = query.offset(skip).limit(limit).all()

        # Log list access
        audit_logger.log_organization_event(
            "list_organizations",
            user_id=str(current_user.id),
            details={"skip": skip, "limit": limit}
        )

        return [OrganizationResponse(**org.to_dict()) for org in organizations]

    except Exception as e:
        logger.error(f"Organization listing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list organizations"
        )