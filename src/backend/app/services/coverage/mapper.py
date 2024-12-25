"""
Coverage mapping service for AI-powered MITRE ATT&CK technique identification
and coverage management with enhanced caching and performance optimizations.

Versions:
- sqlalchemy: 2.0+
- langchain: 0.1.0+
- redis: 4.5+
- requests: 2.31+
"""

import json
import time
from typing import Dict, List, Optional, Tuple
from uuid import UUID
import logging
from datetime import datetime
from functools import wraps

# External imports
from sqlalchemy.ext.asyncio import AsyncSession
from redis import Redis
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import requests

# Internal imports
from app.models.coverage import Coverage
from app.services.genai.processor import GenAIProcessor
from app.core.config import settings
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__, {"service": "coverage_mapper"})

# Constants for caching and performance
MAPPING_CACHE_PREFIX = "coverage:mapping:"
MAPPING_CACHE_TTL = 3600  # 1 hour
MIN_CONFIDENCE_THRESHOLD = 0.75
MAX_TECHNIQUES_PER_DETECTION = 15
MITRE_TECHNIQUE_CACHE_PREFIX = "mitre:technique:"
MITRE_TECHNIQUE_CACHE_TTL = 86400  # 24 hours
MAX_RETRY_ATTEMPTS = 3
RETRY_BACKOFF_FACTOR = 1.5

def log_performance(func):
    """Decorator to log performance metrics for coverage operations"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        try:
            result = await func(*args, **kwargs)
            execution_time = time.perf_counter() - start_time
            logger.info(
                "Coverage operation completed",
                operation=func.__name__,
                execution_time=execution_time
            )
            return result
        except Exception as e:
            execution_time = time.perf_counter() - start_time
            logger.error(
                "Coverage operation failed",
                operation=func.__name__,
                error=str(e),
                execution_time=execution_time
            )
            raise
    return wrapper

class CoverageMapper:
    """
    Service class for AI-powered mapping of detections to MITRE ATT&CK techniques
    with enhanced caching, validation, and performance monitoring.
    """

    def __init__(
        self,
        db_session: AsyncSession,
        cache: Redis,
        config: Dict
    ):
        """
        Initialize coverage mapper with dependencies and configuration.

        Args:
            db_session: Async database session
            cache: Redis cache instance
            config: Service configuration dictionary
        """
        self.db_session = db_session
        self.cache = cache
        self.ai_processor = GenAIProcessor()
        
        # Configure MITRE API client
        self.mitre_api_url = config.get("mitre_api_url", "https://attack.mitre.org/api/v1")
        self.retry_config = Retry(
            total=MAX_RETRY_ATTEMPTS,
            backoff_factor=RETRY_BACKOFF_FACTOR,
            status_forcelist=[500, 502, 503, 504]
        )
        self.http_adapter = HTTPAdapter(max_retries=self.retry_config)
        self.session = requests.Session()
        self.session.mount("https://", self.http_adapter)
        
        logger.info("Initialized CoverageMapper service")

    @log_performance
    async def map_detection(
        self,
        detection_id: UUID,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Map detection to MITRE ATT&CK techniques using AI with validation.

        Args:
            detection_id: UUID of the detection to map
            options: Optional mapping configuration

        Returns:
            Dict containing mapping results with confidence scores
        """
        try:
            # Check cache first
            cache_key = f"{MAPPING_CACHE_PREFIX}{detection_id}"
            cached_mapping = self.cache.get(cache_key)
            if cached_mapping:
                return json.loads(cached_mapping)

            # Get detection from database
            detection = await self._get_detection(detection_id)
            if not detection:
                raise ValueError(f"Detection not found: {detection_id}")

            # Extract detection content for AI processing
            detection_content = {
                "name": detection.name,
                "description": detection.description,
                "logic": detection.logic,
                "platform": detection.platform.value
            }

            # Process with AI for technique identification
            processing_result = await self.ai_processor.process_intelligence(
                intelligence_text=json.dumps(detection_content),
                focus_areas=["mitre_techniques"]
            )

            if not processing_result.success:
                raise ValueError(f"AI processing failed: {processing_result.errors}")

            # Validate and filter techniques
            techniques = await self._validate_techniques(
                processing_result.result.get("mitre_mappings", [])
            )

            # Calculate confidence scores
            scored_techniques = await self._calculate_confidence_scores(
                techniques, detection_content
            )

            # Filter by confidence threshold and limit
            valid_techniques = [
                t for t in scored_techniques
                if t["confidence"] >= MIN_CONFIDENCE_THRESHOLD
            ][:MAX_TECHNIQUES_PER_DETECTION]

            # Create coverage mappings
            coverage_mappings = await self._create_coverage_mappings(
                detection_id, valid_techniques
            )

            # Prepare result
            result = {
                "detection_id": str(detection_id),
                "techniques": valid_techniques,
                "coverage_mappings": coverage_mappings,
                "timestamp": datetime.utcnow().isoformat()
            }

            # Cache result
            self.cache.setex(
                cache_key,
                MAPPING_CACHE_TTL,
                json.dumps(result)
            )

            return result

        except Exception as e:
            logger.error(
                "Mapping failed",
                detection_id=str(detection_id),
                error=str(e)
            )
            raise

    async def _get_detection(self, detection_id: UUID) -> Dict:
        """Retrieve detection from database"""
        try:
            async with self.db_session.begin():
                detection = await self.db_session.get(detection_id)
                if not detection:
                    raise ValueError(f"Detection not found: {detection_id}")
                return detection
        except Exception as e:
            logger.error(f"Database error: {str(e)}")
            raise

    async def _validate_techniques(self, techniques: List[Dict]) -> List[Dict]:
        """Validate identified techniques against MITRE ATT&CK"""
        validated_techniques = []
        
        for technique in techniques:
            technique_id = technique.get("technique_id")
            if not technique_id:
                continue

            # Check cache first
            cache_key = f"{MITRE_TECHNIQUE_CACHE_PREFIX}{technique_id}"
            cached_technique = self.cache.get(cache_key)
            
            if cached_technique:
                validated_techniques.append(json.loads(cached_technique))
                continue

            # Validate against MITRE API
            try:
                response = self.session.get(
                    f"{self.mitre_api_url}/techniques/{technique_id}"
                )
                response.raise_for_status()
                
                technique_data = response.json()
                validated_technique = {
                    "technique_id": technique_id,
                    "name": technique_data["name"],
                    "description": technique_data["description"],
                    "tactics": technique_data["tactics"]
                }
                
                # Cache validated technique
                self.cache.setex(
                    cache_key,
                    MITRE_TECHNIQUE_CACHE_TTL,
                    json.dumps(validated_technique)
                )
                
                validated_techniques.append(validated_technique)
                
            except Exception as e:
                logger.warning(
                    f"Technique validation failed: {technique_id}",
                    error=str(e)
                )
                continue

        return validated_techniques

    async def _calculate_confidence_scores(
        self,
        techniques: List[Dict],
        detection_content: Dict
    ) -> List[Dict]:
        """Calculate confidence scores for technique mappings using AI"""
        scored_techniques = []
        
        for technique in techniques:
            confidence_result = await self.ai_processor.calculate_confidence(
                content=json.dumps(detection_content),
                technique=json.dumps(technique)
            )
            
            if confidence_result.success:
                technique["confidence"] = confidence_result.result.get("confidence", 0.0)
                scored_techniques.append(technique)

        return sorted(
            scored_techniques,
            key=lambda x: x["confidence"],
            reverse=True
        )

    async def _create_coverage_mappings(
        self,
        detection_id: UUID,
        techniques: List[Dict]
    ) -> List[Dict]:
        """Create coverage mappings in database"""
        mappings = []
        
        try:
            async with self.db_session.begin():
                for technique in techniques:
                    coverage = Coverage(
                        organization_id=detection_id.organization_id,
                        mitre_id=technique["technique_id"],
                        name=technique["name"],
                        type="technique"
                    )
                    
                    # Add detection mapping
                    coverage.add_detection_mapping(
                        detection_id=detection_id,
                        mapping_data={
                            "quality_score": technique["confidence"],
                            "mapping_type": "ai_generated",
                            "confidence": technique["confidence"]
                        }
                    )
                    
                    # Update coverage metrics
                    coverage.update_coverage()
                    
                    self.db_session.add(coverage)
                    mappings.append(coverage.to_dict())

        except Exception as e:
            logger.error(
                "Failed to create coverage mappings",
                detection_id=str(detection_id),
                error=str(e)
            )
            raise

        return mappings