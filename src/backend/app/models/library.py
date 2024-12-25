# External imports - versions specified for security tracking
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, Index  # sqlalchemy v2.0+
from sqlalchemy.orm import relationship, validates  # sqlalchemy v2.0+
from sqlalchemy.dialects.postgresql import UUID, JSONB  # sqlalchemy v2.0+
from datetime import datetime
import uuid
import logging
from typing import Dict, List, Optional
from enum import Enum as PyEnum

# Internal imports
from ..db.base import Base

# Configure logging
logger = logging.getLogger(__name__)

class LibraryVisibility(PyEnum):
    """Enumeration of library visibility levels with strict access control"""
    private = "private"  # Only creator can access
    organization = "organization"  # All org members can access
    public = "public"  # Available to all platform users

class Library(Base):
    """
    Enterprise-grade SQLAlchemy model for detection libraries with enhanced 
    security controls and performance optimizations.
    
    Implements comprehensive library management with visibility controls,
    audit trails, and secure relationship handling.
    """
    __tablename__ = "detection_libraries"

    # Primary key and relationships
    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID, 
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False
    )

    # Core library attributes
    name = Column(String(100), nullable=False)
    description = Column(Text)
    visibility = Column(
        Enum(LibraryVisibility, name="library_visibility"),
        nullable=False,
        default=LibraryVisibility.private
    )
    settings = Column(JSONB, nullable=False, default=dict)

    # Audit timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships with security controls
    organization = relationship(
        "Organization",
        back_populates="libraries",
        lazy="joined"
    )
    detections = relationship(
        "Detection",
        back_populates="library",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )

    # Performance optimization indexes
    __table_args__ = (
        Index(
            "idx_library_org_visibility",
            "organization_id",
            "visibility",
            postgresql_using="btree"
        ),
    )

    def __init__(
        self,
        name: str,
        organization_id: uuid.UUID,
        visibility: LibraryVisibility,
        description: Optional[str] = None,
        settings: Optional[Dict] = None
    ):
        """
        Initialize a new Library instance with security controls and audit trail.
        
        Args:
            name: Library name
            organization_id: UUID of parent organization
            visibility: Library visibility level
            description: Optional library description
            settings: Optional library settings dictionary
        """
        self.id = uuid.uuid4()
        self.name = name
        self.organization_id = organization_id
        self.visibility = visibility
        self.description = description
        self.settings = settings or {
            "default_platform": "sigma",
            "auto_validate": True,
            "require_mitre_mapping": True,
            "allow_community_contributions": False
        }
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        logger.info(
            f"Created new library {self.id} in organization {organization_id} "
            f"with {visibility.value} visibility"
        )

    @validates("name")
    def validate_name(self, key: str, name: str) -> str:
        """Validate library name format and length"""
        if not name or len(name) > 100:
            raise ValueError("Library name must be between 1 and 100 characters")
        return name

    @validates("visibility")
    def validate_visibility(self, key: str, visibility: LibraryVisibility) -> LibraryVisibility:
        """Validate library visibility level"""
        if not isinstance(visibility, LibraryVisibility):
            try:
                visibility = LibraryVisibility(visibility)
            except ValueError:
                raise ValueError(
                    f"Invalid visibility level. Must be one of: "
                    f"{', '.join(v.value for v in LibraryVisibility)}"
                )
        return visibility

    @validates("settings")
    def validate_settings(self, key: str, settings: Dict) -> Dict:
        """Validate library settings schema"""
        required_keys = {
            "default_platform",
            "auto_validate",
            "require_mitre_mapping",
            "allow_community_contributions"
        }
        
        if not all(key in settings for key in required_keys):
            raise ValueError(f"Settings must contain all required keys: {required_keys}")
            
        return settings

    def to_dict(self, include_relationships: bool = False) -> Dict:
        """
        Convert library model to secure dictionary representation.
        
        Args:
            include_relationships: Whether to include related entities
            
        Returns:
            Dictionary containing library attributes
        """
        result = {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "name": self.name,
            "description": self.description,
            "visibility": self.visibility.value,
            "settings": self.settings,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

        if include_relationships:
            result.update({
                "organization": self.organization.to_dict() if self.organization else None,
                "detection_count": self.detections.count()
            })

        return result

    def update_settings(self, settings: Dict) -> None:
        """
        Update library settings with validation.
        
        Args:
            settings: New settings dictionary
            
        Raises:
            ValueError: If settings validation fails
        """
        # Validate new settings
        self.validate_settings("settings", settings)
        
        # Update settings and timestamp
        self.settings.update(settings)
        self.updated_at = datetime.utcnow()
        
        logger.info(f"Updated settings for library {self.id}")

    def add_detection(self, detection: "Detection") -> None:
        """
        Add detection with security validation.
        
        Args:
            detection: Detection instance to add
            
        Raises:
            ValueError: If visibility or organization mismatch
        """
        # Validate organization match
        if detection.creator.organization_id != self.organization_id:
            raise ValueError("Detection creator must be in same organization")
            
        # Validate visibility compatibility
        if (self.visibility == LibraryVisibility.private and 
            detection.creator_id != self.organization.owner_id):
            raise ValueError("Cannot add detection to private library")
            
        # Add detection and update timestamp
        self.detections.append(detection)
        self.updated_at = datetime.utcnow()
        
        logger.info(f"Added detection {detection.id} to library {self.id}")

    def __repr__(self) -> str:
        """Secure string representation without sensitive data"""
        return f"<Library {self.name} ({self.visibility.value})>"