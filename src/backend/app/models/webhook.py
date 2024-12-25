# External imports - versions specified for security tracking
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON  # sqlalchemy v2.0+
from sqlalchemy.orm import validates  # sqlalchemy v2.0+
from datetime import datetime
import re
import logging
from typing import Dict, Optional

# Internal imports
from ..db.base import Base

# Configure logging
logger = logging.getLogger(__name__)

# Constants for validation
URL_PATTERN = re.compile(
    r'^https:\/\/(?:[\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$'
)
SUPPORTED_SERVICE_TYPES = {
    'github': {'rate_limit': 5000, 'rate_period': 3600},
    'splunk': {'rate_limit': 1000, 'rate_period': 60},
    'sentinel': {'rate_limit': 100, 'rate_period': 60},
    'chronicle': {'rate_limit': 500, 'rate_period': 60},
    'elastic': {'rate_limit': 200, 'rate_period': 60}
}

class Webhook(Base):
    """
    SQLAlchemy model for managing webhook configurations with enhanced security,
    monitoring, and validation capabilities.
    
    Implements comprehensive webhook management for external service integrations
    with rate limiting, authentication, and monitoring features.
    """
    __tablename__ = 'webhooks'

    # Primary key and identification
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    url = Column(String(1024), nullable=False)
    service_type = Column(String(50), nullable=False)
    organization_id = Column(Integer, ForeignKey('organization.id'), nullable=False)

    # Status and configuration
    is_active = Column(Boolean, default=True, nullable=False)
    config = Column(JSON, nullable=True)

    # Security settings
    secret = Column(String(255), nullable=True)  # Webhook secret for signature verification
    auth_token = Column(String(1024), nullable=True)  # Authentication token
    ip_whitelist = Column(JSON, nullable=True)  # List of allowed IP addresses

    # Rate limiting
    rate_limit = Column(Integer, default=100, nullable=False)
    rate_period = Column(Integer, default=60, nullable=False)  # Period in seconds
    retry_count = Column(Integer, default=3, nullable=False)
    timeout = Column(Integer, default=30, nullable=False)  # Timeout in seconds

    # Monitoring
    error_count = Column(Integer, default=0, nullable=False)
    last_triggered = Column(DateTime, nullable=True)
    last_error = Column(DateTime, nullable=True)

    # Audit timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    @validates('url')
    def validate_url(self, key: str, url: str) -> str:
        """
        Validate webhook URL format and HTTPS requirement.
        
        Args:
            key: Field name being validated
            url: URL to validate
            
        Returns:
            str: Validated URL
            
        Raises:
            ValueError: If URL format is invalid or not HTTPS
        """
        if not URL_PATTERN.match(url):
            raise ValueError(
                "Invalid webhook URL. Must be HTTPS and properly formatted."
            )
        return url

    @validates('service_type')
    def validate_service_type(self, key: str, service_type: str) -> str:
        """
        Validate service type against supported platforms.
        
        Args:
            key: Field name being validated
            service_type: Service type to validate
            
        Returns:
            str: Validated service type
            
        Raises:
            ValueError: If service type is not supported
        """
        if service_type not in SUPPORTED_SERVICE_TYPES:
            raise ValueError(
                f"Unsupported service type. Must be one of: {', '.join(SUPPORTED_SERVICE_TYPES.keys())}"
            )
        
        # Set default rate limits for service type
        self.rate_limit = SUPPORTED_SERVICE_TYPES[service_type]['rate_limit']
        self.rate_period = SUPPORTED_SERVICE_TYPES[service_type]['rate_period']
        
        return service_type

    @validates('rate_limit', 'rate_period', 'retry_count', 'timeout')
    def validate_limits(self, key: str, value: int) -> int:
        """
        Validate rate limiting and timeout parameters.
        
        Args:
            key: Field name being validated
            value: Value to validate
            
        Returns:
            int: Validated value
            
        Raises:
            ValueError: If value is invalid
        """
        if value < 1:
            raise ValueError(f"{key} must be greater than 0")
            
        if key == 'timeout' and value > 300:  # Max 5 minutes timeout
            raise ValueError("Timeout cannot exceed 300 seconds")
            
        return value

    def to_dict(self) -> Dict:
        """
        Convert webhook model to dictionary representation with sensitive data masked.
        
        Returns:
            Dict: Dictionary containing webhook attributes with masked sensitive data
        """
        return {
            'id': self.id,
            'name': self.name,
            'url': self.url,
            'service_type': self.service_type,
            'organization_id': self.organization_id,
            'is_active': self.is_active,
            'config': self.config,
            'secret': '********' if self.secret else None,
            'auth_token': '********' if self.auth_token else None,
            'ip_whitelist': self.ip_whitelist,
            'rate_limit': self.rate_limit,
            'rate_period': self.rate_period,
            'retry_count': self.retry_count,
            'timeout': self.timeout,
            'error_count': self.error_count,
            'last_triggered': self.last_triggered.isoformat() if self.last_triggered else None,
            'last_error': self.last_error.isoformat() if self.last_error else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

    def __repr__(self) -> str:
        """Secure string representation without sensitive data."""
        return f"<Webhook {self.name} ({self.service_type})>"