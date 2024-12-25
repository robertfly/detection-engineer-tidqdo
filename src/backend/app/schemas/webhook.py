# External imports - versions specified for security tracking
from pydantic import BaseModel, Field, validator, root_validator  # pydantic v2.0+
from pydantic import HttpUrl, IPvAnyAddress, SecretStr, Json  # pydantic v2.0+
from datetime import datetime
from typing import List, Dict, Optional

# Constants for validation
SERVICE_TYPES = ['slack', 'github', 'microsoft_teams', 'elastic_security']
SCHEMA_VERSION = '1.0.0'
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

class WebhookBase(BaseModel):
    """
    Base Pydantic model for webhook configuration with comprehensive validation
    and security features.
    """
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Webhook name"
    )
    url: HttpUrl = Field(
        ...,
        description="Webhook endpoint URL"
    )
    service_type: str = Field(
        ...,
        regex='^[a-z_]+$',
        description="Integration service type"
    )
    organization_id: int = Field(
        ...,
        gt=0,
        description="Organization ID owning this webhook"
    )
    is_active: bool = Field(
        default=True,
        description="Webhook active status"
    )
    config: Optional[Json] = Field(
        None,
        description="Platform-specific configuration"
    )
    secret: Optional[SecretStr] = Field(
        None,
        min_length=16,
        max_length=255,
        description="Webhook secret for signature verification"
    )
    schema_version: str = Field(
        default=SCHEMA_VERSION,
        description="Schema version for compatibility"
    )
    retry_config: Dict[str, int] = Field(
        default_factory=lambda: {
            'max_retries': MAX_RETRIES,
            'timeout': DEFAULT_TIMEOUT
        },
        description="Retry and timeout configuration"
    )
    ip_whitelist: Optional[List[IPvAnyAddress]] = Field(
        None,
        description="List of allowed IP addresses"
    )
    event_types: List[str] = Field(
        default_factory=list,
        description="List of event types to trigger webhook"
    )
    rate_limit: Optional[Dict[str, int]] = Field(
        None,
        description="Rate limiting configuration"
    )
    headers: Optional[Dict[str, str]] = Field(
        None,
        description="Custom HTTP headers"
    )

    @validator('service_type')
    def validate_service_type(cls, value: str) -> str:
        """
        Validate service type against supported platforms.
        
        Args:
            value: Service type to validate
            
        Returns:
            str: Validated service type
            
        Raises:
            ValueError: If service type is not supported
        """
        if value not in SERVICE_TYPES:
            raise ValueError(
                f"Unsupported service type. Must be one of: {', '.join(SERVICE_TYPES)}"
            )
        return value

    @root_validator
    def validate_config(cls, values: Dict) -> Dict:
        """
        Validate platform-specific configuration and security requirements.
        
        Args:
            values: Dictionary of field values
            
        Returns:
            Dict: Validated values
            
        Raises:
            ValueError: If configuration is invalid
        """
        service_type = values.get('service_type')
        config = values.get('config')

        if not service_type:
            return values

        # Validate platform-specific requirements
        if service_type == 'slack':
            if not config or 'channel' not in config:
                raise ValueError("Slack webhooks require 'channel' in config")
            if not values.get('secret'):
                raise ValueError("Slack webhooks require a signing secret")

        elif service_type == 'github':
            if not values.get('secret'):
                raise ValueError("GitHub webhooks require a secret token")
            if config and not isinstance(config.get('events', []), list):
                raise ValueError("GitHub events must be a list")

        elif service_type == 'microsoft_teams':
            if not config or 'tenant_id' not in config:
                raise ValueError("Microsoft Teams webhooks require 'tenant_id' in config")

        elif service_type == 'elastic_security':
            if not config or 'api_key' not in config:
                raise ValueError("Elastic Security webhooks require 'api_key' in config")

        # Validate rate limits
        rate_limit = values.get('rate_limit')
        if rate_limit:
            if not isinstance(rate_limit.get('requests', 0), int) or \
               not isinstance(rate_limit.get('period', 0), int):
                raise ValueError("Rate limit must specify 'requests' and 'period' as integers")

        return values

class WebhookCreate(WebhookBase):
    """Schema for creating new webhook integrations."""
    pass

class WebhookUpdate(BaseModel):
    """Schema for updating existing webhook integrations."""
    name: Optional[str] = None
    url: Optional[HttpUrl] = None
    is_active: Optional[bool] = None
    config: Optional[Json] = None
    secret: Optional[SecretStr] = None
    retry_config: Optional[Dict[str, int]] = None
    ip_whitelist: Optional[List[IPvAnyAddress]] = None
    event_types: Optional[List[str]] = None
    rate_limit: Optional[Dict[str, int]] = None
    headers: Optional[Dict[str, str]] = None

class WebhookInDB(WebhookBase):
    """Schema for webhook data as stored in database with monitoring fields."""
    id: int
    last_triggered: Optional[datetime] = None
    last_success: Optional[datetime] = None
    last_failure: Optional[datetime] = None
    failure_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic model configuration."""
        from_attributes = True