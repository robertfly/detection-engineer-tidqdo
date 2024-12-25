# External imports - versions specified for security tracking
from sqlalchemy.ext.asyncio import AsyncSession  # sqlalchemy v2.0+
from langchain.llms import OpenAI  # langchain v0.1.0+
from redis import Redis  # redis v4.5+
from requests import Session  # requests v2.31+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0+
import asyncio
import logging
from typing import Dict, List, Optional, Tuple
from uuid import UUID
import json

# Internal imports
from app.models.coverage import Coverage
from app.models.detection import Detection

# Configure logging
logger = logging.getLogger(__name__)

# Constants for configuration and tuning
COVERAGE_CACHE_TTL = 3600  # Cache TTL in seconds
MIN_COVERAGE_SCORE = 0.4  # Minimum acceptable coverage score
CRITICAL_TECHNIQUE_WEIGHT = 2.0  # Weight multiplier for critical techniques
MITRE_API_BASE_URL = "https://api.mitre.org/att&ck/v1"
MITRE_CACHE_PREFIX = "mitre:"
CACHE_VERSION_KEY = "coverage_analyzer:version"
MAX_RETRY_ATTEMPTS = 3
CIRCUIT_BREAKER_THRESHOLD = 5
BATCH_SIZE = 100
WORKER_POOL_SIZE = 4

class CoverageAnalyzer:
    """
    Enhanced service class for analyzing detection coverage and identifying gaps
    with improved caching, error handling, and performance optimizations.
    """

    def __init__(
        self,
        db_session: AsyncSession,
        cache: Redis,
        cache_version: str,
        config: Dict
    ):
        """
        Initialize coverage analyzer with enhanced configuration.

        Args:
            db_session: AsyncSession for database operations
            cache: Redis instance for caching
            cache_version: Cache version for invalidation
            config: Configuration dictionary
        """
        self.db_session = db_session
        self.cache = cache
        self.cache_version = cache_version
        self.config = config
        
        # Initialize HTTP session with retry configuration
        self.http_session = Session()
        self.http_session.headers.update({
            "User-Agent": "AI-Detection-Platform/1.0",
            "Accept": "application/json"
        })

        # Initialize MITRE data cache
        self.mitre_data = {}
        
        # Configure logging
        self.logger = logging.getLogger(__name__)
        
        # Initialize worker pool for parallel processing
        self.worker_pool = asyncio.get_event_loop()

    @retry(
        stop=stop_after_attempt(MAX_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=1, min=4, max=60)
    )
    async def get_mitre_technique(self, technique_id: str) -> Dict:
        """
        Enhanced retrieval of MITRE technique data with retry logic and caching.

        Args:
            technique_id: MITRE ATT&CK technique ID

        Returns:
            Dictionary containing technique data
            
        Raises:
            ValueError: If technique ID is invalid
            RequestException: If API request fails after retries
        """
        # Validate technique ID format
        if not technique_id.startswith('T'):
            raise ValueError(f"Invalid technique ID format: {technique_id}")

        # Generate cache key with version
        cache_key = f"{MITRE_CACHE_PREFIX}{self.cache_version}:{technique_id}"

        # Check cache first
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return json.loads(cached_data)

        try:
            # Fetch from MITRE API
            url = f"{MITRE_API_BASE_URL}/techniques/{technique_id}"
            response = self.http_session.get(url, timeout=10)
            response.raise_for_status()
            
            technique_data = response.json()
            
            # Validate response structure
            if not technique_data.get('id') or not technique_data.get('name'):
                raise ValueError("Invalid technique data received from API")

            # Cache the result
            self.cache.setex(
                cache_key,
                COVERAGE_CACHE_TTL,
                json.dumps(technique_data)
            )

            return technique_data

        except Exception as e:
            self.logger.error(f"Error fetching MITRE data for {technique_id}: {str(e)}")
            raise

    async def analyze_detection_coverage(
        self,
        detection_id: UUID,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Analyze coverage for a single detection with enhanced validation.

        Args:
            detection_id: UUID of the detection to analyze
            options: Optional configuration for analysis

        Returns:
            Dictionary containing coverage analysis results
        """
        try:
            # Fetch detection with optimized query
            detection = await self.db_session.get(Detection, detection_id)
            if not detection:
                raise ValueError(f"Detection {detection_id} not found")

            # Extract MITRE mappings
            mitre_mapping = detection.mitre_mapping
            if not mitre_mapping:
                return {
                    "detection_id": str(detection_id),
                    "coverage_score": 0.0,
                    "mapped_techniques": [],
                    "validation_errors": ["No MITRE mappings found"]
                }

            # Analyze each mapped technique
            coverage_data = []
            for technique_id, mapping_data in mitre_mapping.items():
                technique_info = await self.get_mitre_technique(technique_id)
                
                # Calculate technique-specific coverage score
                coverage_score = self._calculate_technique_coverage(
                    detection.logic,
                    technique_info,
                    mapping_data
                )

                coverage_data.append({
                    "technique_id": technique_id,
                    "name": technique_info.get("name"),
                    "coverage_score": coverage_score,
                    "is_critical": technique_info.get("is_critical", False)
                })

            # Calculate overall coverage score
            total_score = self._calculate_overall_coverage(coverage_data)

            return {
                "detection_id": str(detection_id),
                "coverage_score": total_score,
                "mapped_techniques": coverage_data,
                "validation_errors": []
            }

        except Exception as e:
            self.logger.error(f"Error analyzing detection {detection_id}: {str(e)}")
            raise

    async def analyze_library_coverage(
        self,
        library_id: UUID,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Parallel analysis of library coverage with bulk operations.

        Args:
            library_id: UUID of the detection library
            options: Optional configuration for analysis

        Returns:
            Dictionary containing aggregated coverage analysis
        """
        try:
            # Fetch all library detections in batches
            detections = []
            async with self.db_session.begin():
                query = (
                    self.db_session.query(Detection)
                    .filter(Detection.library_id == library_id)
                    .filter(Detection.status == 'published')
                )
                
                # Process in batches for memory efficiency
                offset = 0
                while True:
                    batch = await query.offset(offset).limit(BATCH_SIZE).all()
                    if not batch:
                        break
                    detections.extend(batch)
                    offset += BATCH_SIZE

            # Parallel coverage analysis
            tasks = [
                self.analyze_detection_coverage(detection.id, options)
                for detection in detections
            ]
            
            coverage_results = await asyncio.gather(*tasks)

            # Aggregate results
            aggregated_coverage = self._aggregate_library_coverage(coverage_results)
            
            # Cache aggregated results
            cache_key = f"library_coverage:{library_id}:{self.cache_version}"
            self.cache.setex(
                cache_key,
                COVERAGE_CACHE_TTL,
                json.dumps(aggregated_coverage)
            )

            return aggregated_coverage

        except Exception as e:
            self.logger.error(f"Error analyzing library {library_id}: {str(e)}")
            raise

    def _calculate_technique_coverage(
        self,
        detection_logic: Dict,
        technique_info: Dict,
        mapping_data: Dict
    ) -> float:
        """
        Calculate coverage score for a specific technique mapping.

        Args:
            detection_logic: Detection rule logic
            technique_info: MITRE technique information
            mapping_data: Technique mapping metadata

        Returns:
            Float coverage score between 0 and 1
        """
        base_score = mapping_data.get('quality_score', 0.0)
        
        # Apply weights based on technique criticality
        if technique_info.get('is_critical'):
            base_score *= CRITICAL_TECHNIQUE_WEIGHT
            
        # Normalize score to 0-1 range
        return min(max(base_score, 0.0), 1.0)

    def _aggregate_library_coverage(self, coverage_results: List[Dict]) -> Dict:
        """
        Aggregate coverage results for an entire library.

        Args:
            coverage_results: List of individual detection coverage results

        Returns:
            Dictionary containing aggregated coverage metrics
        """
        if not coverage_results:
            return {
                "overall_coverage": 0.0,
                "technique_coverage": {},
                "critical_gaps": [],
                "recommendations": []
            }

        # Aggregate technique coverage
        technique_coverage = {}
        for result in coverage_results:
            for technique in result.get('mapped_techniques', []):
                technique_id = technique['technique_id']
                if technique_id not in technique_coverage:
                    technique_coverage[technique_id] = {
                        "name": technique['name'],
                        "coverage_score": technique['coverage_score'],
                        "detection_count": 1
                    }
                else:
                    existing = technique_coverage[technique_id]
                    existing["coverage_score"] = max(
                        existing["coverage_score"],
                        technique['coverage_score']
                    )
                    existing["detection_count"] += 1

        # Identify critical gaps
        critical_gaps = [
            technique_id for technique_id, data in technique_coverage.items()
            if data['coverage_score'] < MIN_COVERAGE_SCORE
        ]

        # Calculate overall coverage
        overall_coverage = (
            sum(t['coverage_score'] for t in technique_coverage.values()) /
            len(technique_coverage) if technique_coverage else 0.0
        )

        return {
            "overall_coverage": overall_coverage,
            "technique_coverage": technique_coverage,
            "critical_gaps": critical_gaps,
            "recommendations": self._generate_coverage_recommendations(
                technique_coverage,
                critical_gaps
            )
        }

    def _generate_coverage_recommendations(
        self,
        technique_coverage: Dict,
        critical_gaps: List[str]
    ) -> List[Dict]:
        """
        Generate actionable recommendations for improving coverage.

        Args:
            technique_coverage: Aggregated technique coverage data
            critical_gaps: List of critically under-covered techniques

        Returns:
            List of recommendation dictionaries
        """
        recommendations = []

        # Prioritize critical gaps
        for technique_id in critical_gaps:
            technique_data = technique_coverage.get(technique_id, {})
            recommendations.append({
                "priority": "high",
                "technique_id": technique_id,
                "name": technique_data.get("name", "Unknown"),
                "current_coverage": technique_data.get("coverage_score", 0.0),
                "recommendation": "Critical coverage gap detected. Implement additional detection rules."
            })

        # Identify techniques with low detection count
        for technique_id, data in technique_coverage.items():
            if data["detection_count"] == 1 and technique_id not in critical_gaps:
                recommendations.append({
                    "priority": "medium",
                    "technique_id": technique_id,
                    "name": data["name"],
                    "current_coverage": data["coverage_score"],
                    "recommendation": "Consider implementing additional detection rules for redundancy."
                })

        return recommendations