"""
FastAPI router endpoints for managing webhook configurations and integrations.
Implements secure webhook management with platform-specific validation, rate limiting,
circuit breaker patterns, and comprehensive monitoring.

Version: 1.0.0
"""

# External imports - versions specified for security tracking
from fastapi import APIRouter, Depends, HTTPException  # fastapi v0.104+
from sqlalchemy.orm import Session  # sqlalchemy v2.0+
from circuitbreaker import CircuitBreaker  # circuitbreaker v1.3+
from typing import Dict, List, Optional
from datetime import datetime
import logging

# Internal imports
from ....models.webhook import Webhook
from ....schemas.webhook import WebhookCreate, WebhookUpdate
from ....core.security import SecurityLogger
from ....db.session import get_db
from ....core.auth import get_current_active_user, check_role_permission

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Initialize security logger
security_logger = SecurityLogger()

# Configure circuit breaker for webhook operations
circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    name="webhook_operations"
)

@router.post("/", status_code=201, response_model=Dict)
@circuit_breaker
async def create_webhook(
    webhook_in: WebhookCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> Dict:
    """
    Create a new webhook configuration with security validation and rate limiting.
    
    Args:
        webhook_in: Webhook creation schema
        db: Database session
        current_user: Authenticated user making the request
        
    Returns:
        Dict: Created webhook configuration
        
    Raises:
        HTTPException: For validation or permission errors
    """
    # Check user permissions
    if not check_role_permission(["admin", "manager"])(current_user):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions to create webhooks"
        )
    
    try:
        # Create webhook instance
        webhook = Webhook(
            name=webhook_in.name,
            url=str(webhook_in.url),
            service_type=webhook_in.service_type,
            organization_id=current_user.organization_id,
            config=webhook_in.config,
            secret=webhook_in.secret.get_secret_value() if webhook_in.secret else None,
            ip_whitelist=webhook_in.ip_whitelist,
            rate_limit=webhook_in.rate_limit,
            retry_config=webhook_in.retry_config
        )
        
        # Add to database
        db.add(webhook)
        db.commit()
        db.refresh(webhook)
        
        # Log security event
        security_logger.log_webhook_access(
            user_id=current_user.id,
            webhook_id=webhook.id,
            action="create",
            status="success"
        )
        
        return webhook.to_dict()
        
    except Exception as e:
        db.rollback()
        logger.error(f"Webhook creation failed: {str(e)}")
        security_logger.log_security_event(
            "webhook_creation_failed",
            {"error": str(e), "user_id": current_user.id}
        )
        raise HTTPException(
            status_code=400,
            detail=f"Webhook creation failed: {str(e)}"
        )

@router.get("/", response_model=List[Dict])
async def list_webhooks(
    skip: int = 0,
    limit: int = 100,
    service_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> List[Dict]:
    """
    List webhook configurations with optional filtering.
    
    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        service_type: Optional service type filter
        db: Database session
        current_user: Authenticated user
        
    Returns:
        List[Dict]: List of webhook configurations
    """
    query = db.query(Webhook).filter(
        Webhook.organization_id == current_user.organization_id
    )
    
    if service_type:
        query = query.filter(Webhook.service_type == service_type)
    
    webhooks = query.offset(skip).limit(limit).all()
    return [webhook.to_dict() for webhook in webhooks]

@router.get("/{webhook_id}", response_model=Dict)
async def get_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> Dict:
    """
    Retrieve a specific webhook configuration.
    
    Args:
        webhook_id: ID of webhook to retrieve
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Dict: Webhook configuration
        
    Raises:
        HTTPException: If webhook not found or unauthorized
    """
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.organization_id == current_user.organization_id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=404,
            detail="Webhook not found"
        )
    
    return webhook.to_dict()

@router.put("/{webhook_id}", response_model=Dict)
@circuit_breaker
async def update_webhook(
    webhook_id: int,
    webhook_in: WebhookUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> Dict:
    """
    Update an existing webhook configuration.
    
    Args:
        webhook_id: ID of webhook to update
        webhook_in: Update schema
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Dict: Updated webhook configuration
        
    Raises:
        HTTPException: For validation or permission errors
    """
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.organization_id == current_user.organization_id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=404,
            detail="Webhook not found"
        )
    
    try:
        # Update fields if provided
        if webhook_in.name is not None:
            webhook.name = webhook_in.name
        if webhook_in.url is not None:
            webhook.url = str(webhook_in.url)
        if webhook_in.is_active is not None:
            webhook.is_active = webhook_in.is_active
        if webhook_in.config is not None:
            webhook.config = webhook_in.config
        if webhook_in.secret is not None:
            webhook.secret = webhook_in.secret.get_secret_value()
        if webhook_in.retry_config is not None:
            webhook.retry_config = webhook_in.retry_config
        if webhook_in.ip_whitelist is not None:
            webhook.ip_whitelist = webhook_in.ip_whitelist
        if webhook_in.rate_limit is not None:
            webhook.rate_limit = webhook_in.rate_limit
            
        webhook.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(webhook)
        
        # Log security event
        security_logger.log_webhook_access(
            user_id=current_user.id,
            webhook_id=webhook.id,
            action="update",
            status="success"
        )
        
        return webhook.to_dict()
        
    except Exception as e:
        db.rollback()
        logger.error(f"Webhook update failed: {str(e)}")
        security_logger.log_security_event(
            "webhook_update_failed",
            {"error": str(e), "webhook_id": webhook_id, "user_id": current_user.id}
        )
        raise HTTPException(
            status_code=400,
            detail=f"Webhook update failed: {str(e)}"
        )

@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
) -> None:
    """
    Delete a webhook configuration.
    
    Args:
        webhook_id: ID of webhook to delete
        db: Database session
        current_user: Authenticated user
        
    Raises:
        HTTPException: If webhook not found or unauthorized
    """
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.organization_id == current_user.organization_id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=404,
            detail="Webhook not found"
        )
    
    try:
        db.delete(webhook)
        db.commit()
        
        # Log security event
        security_logger.log_webhook_access(
            user_id=current_user.id,
            webhook_id=webhook_id,
            action="delete",
            status="success"
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Webhook deletion failed: {str(e)}")
        security_logger.log_security_event(
            "webhook_deletion_failed",
            {"error": str(e), "webhook_id": webhook_id, "user_id": current_user.id}
        )
        raise HTTPException(
            status_code=400,
            detail=f"Webhook deletion failed: {str(e)}"
        )