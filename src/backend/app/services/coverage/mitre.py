# External imports - versions specified for security tracking
from aiohttp import ClientSession, ClientTimeout  # aiohttp v3.8+
from redis import Redis  # redis v4.5+
from pydantic import BaseModel, Field  # pydantic v2.0+
import json
import logging
import asyncio
from typing import Dict, List, Optional, Union
from datetime import datetime
from functools import wraps
import backoff
from circuitbreaker import circuit

# Internal imports
from app.models.coverage import CoverageType

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
MITRE_API_BASE_URL = "https://api.mitre.org/att&ck/v1"
MITRE_CACHE_TTL = 86400  # 24 hours
MITRE_CACHE_PREFIX = "mitre:"
MITRE_ENTERPRISE_VERSION = "v13.1"
MITRE_CACHE_VERSION = "1.0.0"
MITRE_MAX_RETRIES = 3
MITRE_RETRY_DELAY = 1.5

class MITREValidationError(Exception):
    """Custom exception for MITRE validation errors"""
    pass

class MITRETechniqueModel(BaseModel):
    """Pydantic model for MITRE technique validation"""
    technique_id: str = Field(regex=r'^T\d{4}(\.\d{3})?$')
    name: str
    description: str
    tactic_refs: List[str]
    is_subtechnique: bool = False
    deprecated: bool = False
    version: str
    relationships: Optional[Dict] = {}

class MITREService:
    """
    Enhanced service class for managing MITRE ATT&CK framework data with improved 
    caching and validation capabilities.
    """
    
    def __init__(self, cache: Redis, config: Dict):
        """
        Initialize MITRE service with enhanced cache and monitoring.
        
        Args:
            cache: Redis connection instance
            config: Service configuration dictionary
        """
        self.cache = cache
        self.http_session = None
        self.enterprise_matrix = {}
        self.cache_stats = {
            "hits": 0,
            "misses": 0,
            "errors": 0
        }
        
        # Configure circuit breaker for API resilience
        self.api_breaker = circuit(
            failure_threshold=5,
            recovery_timeout=60,
            expected_exception=Exception
        )
        
        # Configure HTTP client with timeouts and retries
        self.timeout = ClientTimeout(total=30)
        self.headers = {
            "Accept": "application/json",
            "User-Agent": f"AI-Detection-Platform/{MITRE_CACHE_VERSION}"
        }
        
        logger.info(f"Initialized MITRE service with cache version {MITRE_CACHE_VERSION}")

    async def __aenter__(self):
        """Async context manager entry"""
        self.http_session = ClientSession(
            timeout=self.timeout,
            headers=self.headers
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup"""
        if self.http_session:
            await self.http_session.close()

    def _get_cache_key(self, technique_id: str) -> str:
        """Generate versioned cache key for technique"""
        return f"{MITRE_CACHE_PREFIX}{MITRE_CACHE_VERSION}:{technique_id}"

    @backoff.on_exception(
        backoff.expo,
        Exception,
        max_tries=MITRE_MAX_RETRIES,
        max_time=30
    )
    async def _fetch_technique_from_api(self, technique_id: str) -> Dict:
        """
        Fetch technique data from MITRE API with retry logic.
        
        Args:
            technique_id: MITRE technique ID
            
        Returns:
            Dict containing technique data
            
        Raises:
            MITREValidationError: If API response is invalid
        """
        if not self.http_session:
            self.http_session = ClientSession(
                timeout=self.timeout,
                headers=self.headers
            )

        url = f"{MITRE_API_BASE_URL}/techniques/{technique_id}"
        
        try:
            async with self.http_session.get(url) as response:
                response.raise_for_status()
                data = await response.json()
                
                # Validate response data
                technique = MITRETechniqueModel(**data)
                return technique.dict()
                
        except Exception as e:
            logger.error(f"Failed to fetch technique {technique_id}: {str(e)}")
            self.cache_stats["errors"] += 1
            raise

    async def get_technique(self, technique_id: str, include_relationships: bool = False) -> Dict:
        """
        Enhanced retrieval of technique data with validation and caching.
        
        Args:
            technique_id: MITRE technique ID
            include_relationships: Whether to include related techniques
            
        Returns:
            Dict containing technique data with optional relationships
            
        Raises:
            MITREValidationError: If technique validation fails
        """
        cache_key = self._get_cache_key(technique_id)
        
        # Try cache first
        try:
            cached_data = await self.cache.get(cache_key)
            if cached_data:
                self.cache_stats["hits"] += 1
                technique_data = json.loads(cached_data)
                
                # Validate cached data
                MITRETechniqueModel(**technique_data)
                
                if not include_relationships:
                    technique_data.pop("relationships", None)
                    
                return technique_data
                
        except Exception as e:
            logger.warning(f"Cache retrieval failed for {technique_id}: {str(e)}")
            self.cache_stats["errors"] += 1

        # Cache miss - fetch from API
        self.cache_stats["misses"] += 1
        technique_data = await self._fetch_technique_from_api(technique_id)
        
        # Cache the result
        try:
            await self.cache.setex(
                cache_key,
                MITRE_CACHE_TTL,
                json.dumps(technique_data)
            )
        except Exception as e:
            logger.error(f"Failed to cache technique {technique_id}: {str(e)}")
            self.cache_stats["errors"] += 1

        if not include_relationships:
            technique_data.pop("relationships", None)
            
        return technique_data

    async def get_bulk_techniques(self, technique_ids: List[str]) -> Dict[str, Dict]:
        """
        Efficient bulk technique retrieval with parallel processing.
        
        Args:
            technique_ids: List of MITRE technique IDs
            
        Returns:
            Dict mapping technique IDs to their data
        """
        results = {}
        cache_keys = [self._get_cache_key(tid) for tid in technique_ids]
        
        # Bulk cache check
        try:
            cached_results = await self.cache.mget(cache_keys)
            for tid, data in zip(technique_ids, cached_results):
                if data:
                    self.cache_stats["hits"] += 1
                    results[tid] = json.loads(data)
                    
        except Exception as e:
            logger.error(f"Bulk cache retrieval failed: {str(e)}")
            self.cache_stats["errors"] += 1

        # Fetch missing techniques
        missing_ids = [
            tid for tid in technique_ids 
            if tid not in results
        ]
        
        if missing_ids:
            self.cache_stats["misses"] += len(missing_ids)
            tasks = [
                self._fetch_technique_from_api(tid) 
                for tid in missing_ids
            ]
            
            fetched_data = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results and update cache
            cache_updates = {}
            for tid, data in zip(missing_ids, fetched_data):
                if isinstance(data, Exception):
                    logger.error(f"Failed to fetch {tid}: {str(data)}")
                    continue
                    
                results[tid] = data
                cache_updates[self._get_cache_key(tid)] = json.dumps(data)
            
            # Bulk cache update
            if cache_updates:
                try:
                    pipeline = self.cache.pipeline()
                    for key, value in cache_updates.items():
                        pipeline.setex(key, MITRE_CACHE_TTL, value)
                    await pipeline.execute()
                except Exception as e:
                    logger.error(f"Bulk cache update failed: {str(e)}")
                    self.cache_stats["errors"] += 1

        return results

    async def validate_technique_graph(self, technique_id: str, depth: int = 1) -> Dict:
        """
        Comprehensive technique validation with relationship traversal.
        
        Args:
            technique_id: MITRE technique ID to validate
            depth: Relationship traversal depth
            
        Returns:
            Dict containing validation results and relationship graph
            
        Raises:
            MITREValidationError: If validation fails
        """
        results = {
            "technique_id": technique_id,
            "valid": False,
            "errors": [],
            "relationships": {},
            "sub_techniques": []
        }
        
        try:
            # Validate primary technique
            technique_data = await self.get_technique(
                technique_id, 
                include_relationships=True
            )
            
            # Check deprecation status
            if technique_data.get("deprecated", False):
                results["errors"].append("Technique is deprecated")
                return results
            
            # Process relationships if depth > 0
            if depth > 0 and technique_data.get("relationships"):
                related_ids = [
                    rel["technique_id"] 
                    for rel in technique_data["relationships"].values()
                ]
                results["relationships"] = await self.get_bulk_techniques(related_ids)
            
            # Check for sub-techniques
            if not technique_data.get("is_subtechnique", False):
                sub_pattern = f"{technique_id}."
                sub_techniques = await self.get_bulk_techniques([
                    tid for tid in self.enterprise_matrix
                    if tid.startswith(sub_pattern)
                ])
                results["sub_techniques"] = list(sub_techniques.values())
            
            results["valid"] = len(results["errors"]) == 0
            
        except Exception as e:
            results["errors"].append(str(e))
            logger.error(f"Validation failed for {technique_id}: {str(e)}")
            
        return results