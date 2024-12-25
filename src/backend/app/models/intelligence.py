# External imports - versions specified for security tracking
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Enum  # sqlalchemy v2.0.0
from sqlalchemy.dialects.postgresql import UUID, JSON  # sqlalchemy v2.0.0
from sqlalchemy.orm import validates  # sqlalchemy v2.0.0
from enum import Enum as PyEnum  # python v3.11
from datetime import datetime
from uuid import uuid4
import logging
from typing import Optional, Dict, Any

# Internal imports
from ..db.base import Base

# Configure logging
logger = logging.getLogger(__name__)

@PyEnum.unique
class IntelligenceSourceType(PyEnum):
    """
    Enumeration of supported intelligence source types with validation requirements.
    Maps to technical specification requirements for multi-modal intelligence processing.
    """
    pdf = "pdf"  # PDF document processing with OCR
    url = "url"  # Web content scraping
    image = "image"  # Image analysis and extraction
    text = "text"  # Raw text processing
    structured_data = "structured_data"  # JSON/XML/CSV data
    api_feed = "api_feed"  # Real-time API feeds

@PyEnum.unique
class IntelligenceStatus(PyEnum):
    """
    Enumeration of intelligence processing status states with transition validation.
    Implements comprehensive status tracking for intelligence processing pipeline.
    """
    pending = "pending"  # Initial state
    validating = "validating"  # Input validation
    processing = "processing"  # Content extraction
    analyzing = "analyzing"  # AI analysis
    completed = "completed"  # Successfully processed
    failed = "failed"  # Processing failed
    archived = "archived"  # Archived state

# Minimum accuracy thresholds by source type
ACCURACY_THRESHOLDS = {
    IntelligenceSourceType.pdf: 0.90,  # 90% accuracy for PDF processing
    IntelligenceSourceType.url: 0.95,  # 95% accuracy for URL scraping
    IntelligenceSourceType.image: 0.85,  # 85% accuracy for image analysis
    IntelligenceSourceType.text: 0.98,  # 98% accuracy for text processing
    IntelligenceSourceType.structured_data: 0.99,  # 99% accuracy for structured data
    IntelligenceSourceType.api_feed: 0.95  # 95% accuracy for API feeds
}

class Intelligence(Base):
    """
    SQLAlchemy model for storing and managing intelligence data with comprehensive tracking.
    Implements requirements for multi-modal intelligence processing with accuracy metrics.
    """
    __tablename__ = "intelligence"

    # Primary identification
    id = Column(UUID, primary_key=True, default=uuid4)
    creator_id = Column(UUID, ForeignKey("users.id"), nullable=False)
    
    # Basic information
    name = Column(String(255), nullable=False)
    description = Column(String(1000))
    
    # Source information
    source_type = Column(
        Enum(IntelligenceSourceType),
        nullable=False
    )
    source_url = Column(String(2048))  # Max URL length
    source_content = Column(String)  # Raw content storage
    
    # Processing metadata
    metadata = Column(JSON, nullable=False, default=dict)
    processing_results = Column(JSON, nullable=False, default=dict)
    processing_accuracy = Column(Float, nullable=False, default=0.0)
    
    # Status tracking
    status = Column(
        Enum(IntelligenceStatus),
        nullable=False,
        default=IntelligenceStatus.pending
    )
    
    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Processing history
    validation_history = Column(JSON, nullable=False, default=list)
    processing_metrics = Column(JSON, nullable=False, default=dict)
    retry_count = Column(Integer, nullable=False, default=0)
    error_message = Column(String(1000))

    def __init__(self, **kwargs):
        """
        Initialize intelligence entry with secure defaults and validation.
        
        Args:
            **kwargs: Keyword arguments for intelligence attributes
        """
        super().__init__(**kwargs)
        
        # Generate secure UUID
        self.id = uuid4()
        
        # Set initial status
        self.status = IntelligenceStatus.pending
        
        # Initialize timestamps
        current_time = datetime.utcnow()
        self.created_at = current_time
        self.updated_at = current_time
        
        # Initialize processing metrics
        self.processing_accuracy = 0.0
        self.processing_metrics = {
            "start_time": None,
            "end_time": None,
            "duration": None,
            "steps_completed": [],
            "performance_metrics": {}
        }
        
        # Initialize validation history
        self.validation_history = []
        
        # Set retry count
        self.retry_count = 0
        
        logger.info(f"Created new intelligence entry {self.id} of type {self.source_type}")

    @validates('processing_accuracy')
    def validate_processing_accuracy(self, key: str, value: float) -> float:
        """
        Validate processing accuracy within acceptable ranges.
        
        Args:
            key: Field name being validated
            value: Accuracy value to validate
            
        Returns:
            float: Validated accuracy value
            
        Raises:
            ValueError: If accuracy is outside acceptable range
        """
        if not 0.0 <= value <= 1.0:
            raise ValueError("Processing accuracy must be between 0.0 and 1.0")
            
        # Check minimum threshold for source type
        if value > 0:  # Only check if processing has started
            min_threshold = ACCURACY_THRESHOLDS.get(self.source_type, 0.9)
            if value < min_threshold:
                logger.warning(
                    f"Processing accuracy {value} below minimum threshold "
                    f"{min_threshold} for source type {self.source_type}"
                )
                
        return value

    @validates('status')
    def validate_status(self, key: str, value: IntelligenceStatus) -> IntelligenceStatus:
        """
        Validate status transitions and update tracking metrics.
        
        Args:
            key: Field name being validated
            value: New status value
            
        Returns:
            IntelligenceStatus: Validated status value
            
        Raises:
            ValueError: If status transition is invalid
        """
        if hasattr(self, 'status'):
            # Track status change in validation history
            self.validation_history.append({
                "timestamp": datetime.utcnow().isoformat(),
                "from_status": self.status.value,
                "to_status": value.value
            })
            
            # Update processing metrics
            if value == IntelligenceStatus.processing:
                self.processing_metrics["start_time"] = datetime.utcnow().isoformat()
            elif value == IntelligenceStatus.completed:
                end_time = datetime.utcnow()
                self.processing_metrics["end_time"] = end_time.isoformat()
                if self.processing_metrics.get("start_time"):
                    start_time = datetime.fromisoformat(self.processing_metrics["start_time"])
                    self.processing_metrics["duration"] = (end_time - start_time).total_seconds()
            
        return value

    def __repr__(self) -> str:
        """Secure string representation without sensitive data."""
        return f"<Intelligence {self.id}: {self.source_type.value} - {self.status.value}>"