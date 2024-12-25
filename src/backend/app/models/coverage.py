# External imports - versions specified for security tracking
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Index  # sqlalchemy v2.0+
from sqlalchemy.orm import relationship, validates  # sqlalchemy v2.0+
from sqlalchemy.dialects.postgresql import UUID, JSONB  # sqlalchemy v2.0+
from datetime import datetime
import uuid
import logging
from enum import Enum as PyEnum
from typing import Dict, Optional, List

# Internal imports
from ..db.base import Base
from .detection import Detection

# Configure logging
logger = logging.getLogger(__name__)

class CoverageType(PyEnum):
    """Enumeration of MITRE ATT&CK coverage types"""
    technique = "technique"
    subtechnique = "subtechnique"
    tactic = "tactic"

class Coverage(Base):
    """
    SQLAlchemy model for MITRE ATT&CK coverage analysis and tracking.
    Implements comprehensive coverage metrics, detection mappings, and relationship management.
    """
    __tablename__ = "coverage"

    # Primary key and relationships
    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID, ForeignKey("organizations.id"), nullable=False)

    # MITRE ATT&CK identifiers
    mitre_id = Column(String(50), nullable=False)  # e.g., T1234, TA0001
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)

    # Coverage metrics
    coverage_percentage = Column(Float, nullable=False, default=0.0)
    detection_count = Column(Integer, nullable=False, default=0)

    # Additional metadata and mappings
    metadata = Column(JSONB, nullable=False, default=dict)
    detection_mappings = Column(JSONB, nullable=False, default=dict)

    # Audit timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="coverage_items")
    detections = relationship("Detection", secondary="coverage_detection_map")

    # Indexes for performance optimization
    __table_args__ = (
        Index('ix_coverage_org_type', 'organization_id', 'type'),
        Index('ix_coverage_percentage', 'coverage_percentage'),
        Index('ix_coverage_mitre_id', 'mitre_id', unique=True),
    )

    def __init__(
        self,
        organization_id: uuid.UUID,
        mitre_id: str,
        name: str,
        type: str
    ):
        """
        Initialize a new Coverage instance with default values.

        Args:
            organization_id: UUID of the owning organization
            mitre_id: MITRE ATT&CK technique/tactic ID
            name: Human-readable name of the technique/tactic
            type: Coverage type (technique, subtechnique, tactic)
        """
        self.id = uuid.uuid4()
        self.organization_id = organization_id
        self.mitre_id = mitre_id
        self.name = name
        self.type = type
        self.coverage_percentage = 0.0
        self.detection_count = 0
        self.metadata = {}
        self.detection_mappings = {}
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        logger.info(f"Created new coverage tracking for {mitre_id} in organization {organization_id}")

    @validates('mitre_id')
    def validate_mitre_id(self, key: str, mitre_id: str) -> str:
        """Validate MITRE ATT&CK ID format"""
        if not mitre_id.startswith(('T', 'TA')):
            raise ValueError(f"Invalid MITRE ATT&CK ID format: {mitre_id}")
        return mitre_id

    @validates('type')
    def validate_type(self, key: str, type_value: str) -> str:
        """Validate coverage type"""
        try:
            return CoverageType[type_value].value
        except KeyError:
            raise ValueError(f"Invalid coverage type: {type_value}")

    def update_coverage(self) -> None:
        """
        Update coverage metrics based on detection mappings.
        Calculates coverage percentage and updates detection count.
        """
        try:
            # Calculate total mapped detections
            total_detections = len(self.detection_mappings)
            self.detection_count = total_detections

            # Calculate coverage percentage based on mapping quality
            if total_detections > 0:
                quality_scores = [
                    mapping.get('quality_score', 0.0) 
                    for mapping in self.detection_mappings.values()
                ]
                self.coverage_percentage = (sum(quality_scores) / total_detections) * 100
            else:
                self.coverage_percentage = 0.0

            self.updated_at = datetime.utcnow()
            logger.info(f"Updated coverage metrics for {self.mitre_id}: {self.coverage_percentage}%")

        except Exception as e:
            logger.error(f"Failed to update coverage metrics for {self.mitre_id}: {str(e)}")
            raise

    def add_detection_mapping(self, detection_id: uuid.UUID, mapping_data: Dict) -> None:
        """
        Add a new detection mapping with validation.

        Args:
            detection_id: UUID of the detection to map
            mapping_data: Dictionary containing mapping metadata and quality score
        """
        try:
            # Validate detection exists
            if not Detection.query.get(detection_id):
                raise ValueError(f"Detection {detection_id} not found")

            # Validate mapping data structure
            required_fields = {'quality_score', 'mapping_type', 'confidence'}
            if not all(field in mapping_data for field in required_fields):
                raise ValueError(f"Mapping data must contain: {required_fields}")

            # Add mapping to detection_mappings
            self.detection_mappings[str(detection_id)] = {
                **mapping_data,
                'added_at': datetime.utcnow().isoformat(),
                'last_updated': datetime.utcnow().isoformat()
            }

            # Update coverage metrics
            self.update_coverage()
            logger.info(f"Added detection mapping {detection_id} to {self.mitre_id}")

        except Exception as e:
            logger.error(f"Failed to add detection mapping: {str(e)}")
            raise

    def remove_detection_mapping(self, detection_id: uuid.UUID) -> None:
        """
        Remove a detection mapping and recalculate coverage metrics.

        Args:
            detection_id: UUID of the detection to remove
        """
        try:
            # Remove mapping if exists
            if str(detection_id) in self.detection_mappings:
                del self.detection_mappings[str(detection_id)]
                
                # Update coverage metrics
                self.update_coverage()
                logger.info(f"Removed detection mapping {detection_id} from {self.mitre_id}")
            else:
                logger.warning(f"Detection mapping {detection_id} not found in {self.mitre_id}")

        except Exception as e:
            logger.error(f"Failed to remove detection mapping: {str(e)}")
            raise

    def to_dict(self) -> Dict:
        """
        Convert coverage model to dictionary representation.

        Returns:
            Dictionary containing coverage attributes and relationships
        """
        return {
            "id": str(self.id),
            "organization_id": str(self.organization_id),
            "mitre_id": self.mitre_id,
            "name": self.name,
            "type": self.type,
            "coverage_percentage": round(self.coverage_percentage, 2),
            "detection_count": self.detection_count,
            "metadata": self.metadata,
            "detection_mappings": self.detection_mappings,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "organization": self.organization.to_dict() if self.organization else None,
            "detections": [
                detection.to_dict() for detection in self.detections
            ] if self.detections else []
        }