# External imports - versions specified for security tracking
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum, Index  # sqlalchemy v2.0+
from sqlalchemy.orm import relationship, validates  # sqlalchemy v2.0+
from sqlalchemy.dialects.postgresql import UUID, JSONB  # sqlalchemy v2.0+
from datetime import datetime
from uuid import uuid4
import json
import logging

# Internal imports
from ..db.session import Base
from .detection import Detection

# Configure logging
logger = logging.getLogger(__name__)

class TranslationPlatform(str, Enum):
    """Enumeration of supported translation target platforms"""
    splunk = "splunk"
    sentinel = "sentinel"
    chronicle = "chronicle"
    elastic = "elastic"
    qradar = "qradar"

class ValidationStatus(str, Enum):
    """Enumeration of translation validation statuses"""
    pending = "pending"
    valid = "valid"
    invalid = "invalid"

class Translation(Base):
    """
    SQLAlchemy model representing an enterprise-grade detection rule translation
    with comprehensive validation, tracking, and security features.
    
    Implements cross-platform translation capabilities with 95% accuracy target
    and platform-specific validation rules.
    """
    __tablename__ = "translations"

    # Primary key and relationships
    id = Column(UUID, primary_key=True, default=uuid4)
    detection_id = Column(
        UUID, 
        ForeignKey("detections.id", ondelete="CASCADE"),
        nullable=False
    )

    # Translation attributes
    platform = Column(
        Enum(TranslationPlatform, name="translation_platform_enum"),
        nullable=False
    )
    translated_logic = Column(JSONB, nullable=False)
    validation_status = Column(
        Enum(ValidationStatus, name="validation_status_enum"),
        nullable=False,
        default=ValidationStatus.pending
    )
    validation_message = Column(String(1024))

    # Audit timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_validated_at = Column(DateTime)

    # Relationships
    detection = relationship(
        "Detection",
        back_populates="translations",
        lazy="joined"
    )

    # Indexes for query optimization
    __table_args__ = (
        Index("ix_translations_detection_id", "detection_id"),
        Index("ix_translations_platform", "platform"),
        Index("ix_translations_validation_status", "validation_status"),
        Index("ix_translations_created_at", "created_at"),
    )

    def __init__(self, detection_id: UUID, platform: TranslationPlatform, translated_logic: dict):
        """
        Initialize a new Translation instance with security and validation checks.

        Args:
            detection_id: UUID of the parent detection
            platform: Target platform for translation
            translated_logic: Translated detection logic
        """
        self.id = uuid4()
        self.detection_id = detection_id
        self.platform = platform
        self.translated_logic = self._validate_translated_logic(translated_logic)
        self.validation_status = ValidationStatus.pending
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        logger.info(f"Created new translation {self.id} for detection {detection_id}")

    @validates('translated_logic')
    def validate_translated_logic(self, key: str, value: dict) -> dict:
        """
        Validate translated logic structure and content.
        
        Args:
            key: Field name being validated
            value: Translation logic dictionary
            
        Returns:
            Validated translation logic dictionary
        
        Raises:
            ValueError: If validation fails
        """
        return self._validate_translated_logic(value)

    def _validate_translated_logic(self, logic: dict) -> dict:
        """
        Internal method for translation logic validation.
        
        Args:
            logic: Translation logic to validate
            
        Returns:
            Validated translation logic
            
        Raises:
            ValueError: If validation fails
        """
        if not isinstance(logic, dict):
            raise ValueError("Translated logic must be a dictionary")

        required_fields = {"query", "platform_specific"}
        if not all(field in logic for field in required_fields):
            raise ValueError(f"Translated logic must contain fields: {required_fields}")

        # Validate platform-specific requirements
        platform_validators = {
            TranslationPlatform.splunk: self._validate_splunk_logic,
            TranslationPlatform.sentinel: self._validate_sentinel_logic,
            TranslationPlatform.chronicle: self._validate_chronicle_logic,
            TranslationPlatform.elastic: self._validate_elastic_logic,
            TranslationPlatform.qradar: self._validate_qradar_logic
        }

        if self.platform in platform_validators:
            platform_validators[self.platform](logic)

        return logic

    def _validate_splunk_logic(self, logic: dict) -> None:
        """Validate Splunk-specific translation logic"""
        if not isinstance(logic["query"], str):
            raise ValueError("Splunk query must be a string")
        if not logic["query"].strip():
            raise ValueError("Splunk query cannot be empty")

    def _validate_sentinel_logic(self, logic: dict) -> None:
        """Validate Microsoft Sentinel-specific translation logic"""
        if "table" not in logic["platform_specific"]:
            raise ValueError("Sentinel logic must specify target table")

    def _validate_chronicle_logic(self, logic: dict) -> None:
        """Validate Chronicle-specific translation logic"""
        if "rule_type" not in logic["platform_specific"]:
            raise ValueError("Chronicle logic must specify rule type")

    def _validate_elastic_logic(self, logic: dict) -> None:
        """Validate Elastic-specific translation logic"""
        if "index_pattern" not in logic["platform_specific"]:
            raise ValueError("Elastic logic must specify index pattern")

    def _validate_qradar_logic(self, logic: dict) -> None:
        """Validate QRadar-specific translation logic"""
        if "log_source" not in logic["platform_specific"]:
            raise ValueError("QRadar logic must specify log source")

    def to_dict(self) -> dict:
        """
        Convert translation model to secure dictionary representation.
        
        Returns:
            dict: Sanitized dictionary containing translation attributes
        """
        return {
            "id": str(self.id),
            "detection_id": str(self.detection_id),
            "platform": self.platform.value,
            "translated_logic": self.translated_logic,
            "validation_status": self.validation_status.value,
            "validation_message": self.validation_message,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "last_validated_at": self.last_validated_at.isoformat() if self.last_validated_at else None
        }

    def update_logic(self, translated_logic: dict) -> bool:
        """
        Securely update translated detection logic with validation.
        
        Args:
            translated_logic: New translated logic dictionary
            
        Returns:
            bool: Success status of update operation
        """
        try:
            validated_logic = self._validate_translated_logic(translated_logic)
            self.translated_logic = validated_logic
            self.validation_status = ValidationStatus.pending
            self.updated_at = datetime.utcnow()
            
            logger.info(f"Updated logic for translation {self.id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update translation {self.id}: {str(e)}")
            return False

    def set_validation_status(self, status: ValidationStatus, message: str = None) -> bool:
        """
        Update translation validation status with security checks.
        
        Args:
            status: New validation status
            message: Optional validation message
            
        Returns:
            bool: Success status of validation update
        """
        try:
            if not isinstance(status, ValidationStatus):
                raise ValueError(f"Invalid validation status: {status}")
                
            self.validation_status = status
            self.validation_message = message[:1024] if message else None
            self.last_validated_at = datetime.utcnow()
            self.updated_at = datetime.utcnow()
            
            logger.info(f"Updated validation status for translation {self.id} to {status.value}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update validation status for translation {self.id}: {str(e)}")
            return False