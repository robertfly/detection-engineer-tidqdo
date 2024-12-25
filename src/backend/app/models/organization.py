# External imports - versions specified for security tracking
from sqlalchemy import Column, String, Text, Boolean, DateTime, Enum  # sqlalchemy v2.0+
from sqlalchemy.orm import relationship, validates  # sqlalchemy v2.0+
from sqlalchemy.dialects.postgresql import UUID, JSONB  # sqlalchemy v2.0+
from uuid import uuid4
from datetime import datetime
import jsonschema  # jsonschema v4.17+
import re
import logging
from typing import Dict, List, Optional

# Internal imports
from ..db.base import Base

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
ORGANIZATION_TYPES = ['enterprise', 'community']
MAX_ORG_SIZE = 1000

# Domain validation pattern
DOMAIN_PATTERN = re.compile(
    r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
)

# JSON schema for organization settings validation
SETTINGS_SCHEMA = {
    "type": "object",
    "properties": {
        "detection_defaults": {
            "type": "object",
            "properties": {
                "visibility": {"type": "string", "enum": ["private", "public"]},
                "auto_validation": {"type": "boolean"},
                "required_approvals": {"type": "integer", "minimum": 0}
            }
        },
        "security_controls": {
            "type": "object",
            "properties": {
                "mfa_required": {"type": "boolean"},
                "session_timeout": {"type": "integer", "minimum": 300},
                "ip_whitelist": {
                    "type": "array",
                    "items": {"type": "string", "format": "ipv4"}
                }
            }
        },
        "integration_settings": {
            "type": "object",
            "properties": {
                "github_integration": {"type": "boolean"},
                "slack_notifications": {"type": "boolean"},
                "siem_platforms": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            }
        }
    },
    "required": ["detection_defaults", "security_controls"]
}

class Organization(Base):
    """
    Enhanced SQLAlchemy model representing an organization with security controls
    and audit logging capabilities.
    """
    __tablename__ = 'organizations'

    # Primary key and core fields
    id = Column(UUID, primary_key=True, default=uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    type = Column(
        Enum(*ORGANIZATION_TYPES, name='organization_type'),
        nullable=False
    )
    domain = Column(String(100), unique=True)
    settings = Column(JSONB, nullable=False, default=dict)
    is_active = Column(Boolean, default=True)

    # Audit timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    users = relationship("User", secondary="organization_users", back_populates="organizations")
    libraries = relationship("DetectionLibrary", back_populates="organization")
    audit_logs = relationship("OrganizationAuditLog", back_populates="organization")

    def __init__(
        self,
        name: str,
        type: str,
        domain: Optional[str] = None,
        settings: Optional[Dict] = None
    ):
        """
        Initialize organization model with enhanced validation.

        Args:
            name: Organization name
            type: Organization type (enterprise/community)
            domain: Domain for enterprise organizations
            settings: Organization settings dictionary
        """
        self.id = uuid4()
        self.name = name
        self.type = type
        self.domain = domain
        self.settings = settings or {
            "detection_defaults": {
                "visibility": "private",
                "auto_validation": True,
                "required_approvals": 1
            },
            "security_controls": {
                "mfa_required": True,
                "session_timeout": 3600,
                "ip_whitelist": []
            },
            "integration_settings": {
                "github_integration": False,
                "slack_notifications": False,
                "siem_platforms": []
            }
        }
        self.is_active = True
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        logger.info(f"Created new organization: {self.name} ({self.type})")

    @validates('name')
    def validate_name(self, key: str, name: str) -> str:
        """Validate organization name."""
        if not name or len(name) > 100:
            raise ValueError("Organization name must be between 1 and 100 characters")
        return name

    @validates('type')
    def validate_type(self, key: str, type: str) -> str:
        """Validate organization type."""
        if type not in ORGANIZATION_TYPES:
            raise ValueError(f"Invalid organization type. Must be one of: {ORGANIZATION_TYPES}")
        return type

    @validates('domain')
    def validate_domain(self, key: str, domain: Optional[str]) -> Optional[str]:
        """Validate organization domain for enterprise organizations."""
        if self.type == 'enterprise' and not domain:
            raise ValueError("Domain is required for enterprise organizations")
        if domain and not DOMAIN_PATTERN.match(domain):
            raise ValueError("Invalid domain format")
        return domain.lower() if domain else None

    @validates('settings')
    def validate_settings(self, key: str, settings: Dict) -> Dict:
        """Validate organization settings against schema."""
        try:
            jsonschema.validate(settings, SETTINGS_SCHEMA)
            return settings
        except jsonschema.exceptions.ValidationError as e:
            raise ValueError(f"Invalid settings format: {str(e)}")

    def to_dict(self, include_sensitive: bool = False) -> Dict:
        """
        Convert organization model to secure dictionary representation.

        Args:
            include_sensitive: Whether to include sensitive settings

        Returns:
            Dictionary containing organization attributes
        """
        result = {
            "id": str(self.id),
            "name": self.name,
            "type": self.type,
            "domain": self.domain,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "user_count": len(self.users),
            "library_count": len(self.libraries)
        }

        # Include settings with optional sensitive data masking
        if include_sensitive:
            result["settings"] = self.settings
        else:
            # Mask sensitive settings
            masked_settings = self.settings.copy()
            if "security_controls" in masked_settings:
                masked_settings["security_controls"].pop("ip_whitelist", None)
            result["settings"] = masked_settings

        return result

    def update_settings(self, settings: Dict, user_id: UUID) -> bool:
        """
        Securely update organization settings with validation.

        Args:
            settings: New settings dictionary
            user_id: ID of user making the update

        Returns:
            bool: Success status of update operation
        """
        try:
            # Validate new settings
            self.validate_settings("settings", settings)

            # Update settings and timestamp
            self.settings = settings
            self.updated_at = datetime.utcnow()

            # Create audit log entry
            self._create_audit_log(user_id, "update_settings")

            logger.info(f"Updated settings for organization {self.id}")
            return True

        except Exception as e:
            logger.error(f"Failed to update settings for organization {self.id}: {str(e)}")
            return False

    def add_user(self, user: "User", role: str) -> bool:
        """
        Add a user to the organization with role validation.

        Args:
            user: User instance to add
            role: Role to assign to user

        Returns:
            bool: Success status of add operation
        """
        try:
            # Check organization size limit
            if len(self.users) >= MAX_ORG_SIZE:
                raise ValueError(f"Organization size limit ({MAX_ORG_SIZE}) reached")

            # Verify user is not already a member
            if user in self.users:
                raise ValueError("User is already a member of this organization")

            # Add user with role
            self.users.append(user)
            self.updated_at = datetime.utcnow()

            logger.info(f"Added user {user.id} to organization {self.id} with role {role}")
            return True

        except Exception as e:
            logger.error(f"Failed to add user to organization {self.id}: {str(e)}")
            return False

    def verify_domain(self) -> bool:
        """
        Verify organization domain for enterprise organizations.

        Returns:
            bool: Domain verification status
        """
        try:
            if self.type != 'enterprise':
                return True

            if not self.domain:
                return False

            # Implement domain verification logic here
            # This could include DNS record checks, email verification, etc.
            
            logger.info(f"Domain verified for organization {self.id}")
            return True

        except Exception as e:
            logger.error(f"Domain verification failed for organization {self.id}: {str(e)}")
            return False

    def _create_audit_log(self, user_id: UUID, action: str) -> None:
        """Create audit log entry for organization changes."""
        from .audit import OrganizationAuditLog
        
        audit_log = OrganizationAuditLog(
            organization_id=self.id,
            user_id=user_id,
            action=action,
            details={
                "timestamp": datetime.utcnow().isoformat(),
                "type": self.type,
                "settings_updated": action == "update_settings"
            }
        )
        self.audit_logs.append(audit_log)