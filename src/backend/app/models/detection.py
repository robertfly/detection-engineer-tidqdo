# External imports - versions specified for security tracking
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, Index  # sqlalchemy v2.0+
from sqlalchemy.orm import relationship, validates  # sqlalchemy v2.0+
from sqlalchemy.dialects.postgresql import UUID, JSONB  # sqlalchemy v2.0+
from datetime import datetime
from uuid import uuid4
from enum import Enum as PyEnum
from typing import Dict, List, Optional, Tuple
import logging

# Internal imports
from ..db.session import Base

# Configure logging
logger = logging.getLogger(__name__)

class DetectionStatus(PyEnum):
    """Enumeration of valid detection statuses with strict state management"""
    draft = "draft"
    published = "published"
    archived = "archived"
    deprecated = "deprecated"

class DetectionPlatform(PyEnum):
    """Enumeration of supported detection platforms"""
    sigma = "sigma"
    kql = "kql"
    spl = "spl"
    yara_l = "yara-l"

# Define valid status transitions for strict state management
VALID_STATUS_TRANSITIONS = {
    "draft": ["published", "archived"],
    "published": ["deprecated", "archived"],
    "archived": ["draft"],
    "deprecated": ["archived"]
}

class Detection(Base):
    """
    Enterprise-grade SQLAlchemy model for security detection rules with comprehensive
    validation, auditing, and relationship management.
    
    Implements robust detection management with platform-specific translations,
    versioning, and audit trails while maintaining data integrity and security.
    """
    __tablename__ = "detections"

    # Primary key and relationships
    id = Column(UUID, primary_key=True, default=uuid4)
    creator_id = Column(UUID, ForeignKey("users.id"), nullable=False)
    library_id = Column(UUID, ForeignKey("detection_libraries.id"), nullable=False)

    # Core detection attributes
    name = Column(String(255), nullable=False)
    description = Column(Text)
    metadata = Column(JSONB, nullable=False, default=dict)
    logic = Column(JSONB, nullable=False)
    mitre_mapping = Column(JSONB, nullable=False, default=dict)
    validation_results = Column(JSONB, nullable=False, default=dict)

    # Status and platform
    status = Column(
        Enum(DetectionStatus, name="detection_status"),
        nullable=False,
        default=DetectionStatus.draft
    )
    platform = Column(
        Enum(DetectionPlatform, name="detection_platform"),
        nullable=False
    )

    # Audit timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_validated_at = Column(DateTime)

    # Relationships
    creator = relationship("User", back_populates="detections")
    library = relationship("DetectionLibrary", back_populates="detections")
    translations = relationship("DetectionTranslation", back_populates="detection")
    audit_logs = relationship("DetectionAuditLog", back_populates="detection")

    # Indexes for performance optimization
    __table_args__ = (
        Index("ix_detections_creator_id", "creator_id"),
        Index("ix_detections_library_id", "library_id"),
        Index("ix_detections_status", "status"),
        Index("ix_detections_platform", "platform"),
        Index("ix_detections_created_at", "created_at"),
    )

    def __init__(
        self,
        name: str,
        creator_id: UUID,
        library_id: UUID,
        platform: str,
        metadata: dict,
        logic: dict
    ):
        """
        Initialize a new Detection instance with secure defaults and validation.
        
        Args:
            name: Detection name
            creator_id: UUID of the detection creator
            library_id: UUID of the parent library
            platform: Target detection platform
            metadata: Detection metadata dictionary
            logic: Detection logic dictionary
        """
        self.id = uuid4()
        self.name = name
        self.creator_id = creator_id
        self.library_id = library_id
        self.platform = DetectionPlatform[platform]
        self.metadata = metadata or {}
        self.logic = logic
        self.mitre_mapping = {}
        self.validation_results = {"status": "pending", "errors": []}
        self.status = DetectionStatus.draft
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        logger.info(f"Created new detection {self.id} in library {library_id}")

    @validates("status")
    def validate_status(self, key: str, value: str) -> str:
        """Validate status transitions"""
        if hasattr(self, "status"):
            current = self.status.value
            if value not in VALID_STATUS_TRANSITIONS.get(current, []):
                raise ValueError(
                    f"Invalid status transition from {current} to {value}"
                )
        return value

    @validates("platform")
    def validate_platform(self, key: str, value: str) -> str:
        """Validate detection platform"""
        if value not in DetectionPlatform.__members__:
            raise ValueError(f"Invalid detection platform: {value}")
        return value

    @validates("logic")
    def validate_logic(self, key: str, value: dict) -> dict:
        """Validate detection logic structure"""
        required_fields = {"query", "data_model"}
        if not all(field in value for field in required_fields):
            raise ValueError(f"Detection logic must contain: {required_fields}")
        return value

    @validates("mitre_mapping")
    def validate_mitre_mapping(self, key: str, value: dict) -> dict:
        """Validate MITRE ATT&CK mapping format"""
        if not isinstance(value, dict):
            raise ValueError("MITRE mapping must be a dictionary")
        for technique_id in value.keys():
            if not technique_id.startswith("T"):
                raise ValueError(f"Invalid technique ID format: {technique_id}")
        return value

    def to_dict(self, include_relationships: bool = False) -> dict:
        """
        Convert detection model to secure dictionary representation.
        
        Args:
            include_relationships: Whether to include related entities
            
        Returns:
            Dictionary containing detection attributes
        """
        result = {
            "id": str(self.id),
            "name": self.name,
            "creator_id": str(self.creator_id),
            "library_id": str(self.library_id),
            "description": self.description,
            "metadata": self.metadata,
            "logic": self.logic,
            "mitre_mapping": self.mitre_mapping,
            "validation_results": self.validation_results,
            "status": self.status.value,
            "platform": self.platform.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "last_validated_at": self.last_validated_at.isoformat() if self.last_validated_at else None
        }

        if include_relationships:
            result.update({
                "creator": self.creator.to_dict() if self.creator else None,
                "library": self.library.to_dict() if self.library else None,
                "translations": [t.to_dict() for t in self.translations],
            })

        return result

    def update_logic(self, logic: dict, user_id: UUID) -> Tuple[bool, str]:
        """
        Update detection logic with validation and audit trail.
        
        Args:
            logic: New detection logic
            user_id: ID of user making the update
            
        Returns:
            Tuple of (success, message)
        """
        try:
            # Validate logic structure
            self.validate_logic("logic", logic)
            
            # Update logic and metadata
            self.logic = logic
            self.validation_results = {"status": "pending", "errors": []}
            self.updated_at = datetime.utcnow()
            
            # Create audit log entry
            self._create_audit_log(user_id, "update_logic")
            
            logger.info(f"Updated logic for detection {self.id}")
            return True, "Logic updated successfully"
            
        except Exception as e:
            logger.error(f"Failed to update logic for detection {self.id}: {str(e)}")
            return False, str(e)

    def update_mitre_mapping(self, mapping: dict, user_id: UUID) -> Tuple[bool, str]:
        """
        Update MITRE ATT&CK mappings with validation.
        
        Args:
            mapping: New MITRE mapping dictionary
            user_id: ID of user making the update
            
        Returns:
            Tuple of (success, message)
        """
        try:
            # Validate mapping format
            self.validate_mitre_mapping("mitre_mapping", mapping)
            
            # Update mapping and metadata
            self.mitre_mapping = mapping
            self.updated_at = datetime.utcnow()
            
            # Create audit log entry
            self._create_audit_log(user_id, "update_mitre_mapping")
            
            logger.info(f"Updated MITRE mapping for detection {self.id}")
            return True, "MITRE mapping updated successfully"
            
        except Exception as e:
            logger.error(f"Failed to update MITRE mapping for detection {self.id}: {str(e)}")
            return False, str(e)

    def set_status(self, status: DetectionStatus, user_id: UUID) -> Tuple[bool, str]:
        """
        Update detection status with transition validation and audit trail.
        
        Args:
            status: New detection status
            user_id: ID of user making the update
            
        Returns:
            Tuple of (success, message)
        """
        try:
            # Validate status transition
            self.validate_status("status", status.value)
            
            # Check required validations for publishing
            if status == DetectionStatus.published:
                if self.validation_results.get("status") != "success":
                    raise ValueError("Detection must pass validation before publishing")
            
            # Update status and metadata
            self.status = status
            self.updated_at = datetime.utcnow()
            
            # Create audit log entry
            self._create_audit_log(user_id, "status_change")
            
            logger.info(f"Updated status for detection {self.id} to {status.value}")
            return True, f"Status updated to {status.value}"
            
        except Exception as e:
            logger.error(f"Failed to update status for detection {self.id}: {str(e)}")
            return False, str(e)

    def _create_audit_log(self, user_id: UUID, action: str) -> None:
        """Create audit log entry for detection changes"""
        from .audit import DetectionAuditLog
        
        audit_log = DetectionAuditLog(
            detection_id=self.id,
            user_id=user_id,
            action=action,
            details={
                "status": self.status.value,
                "platform": self.platform.value,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        self.audit_logs.append(audit_log)