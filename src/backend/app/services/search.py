# External imports - versions specified for security tracking
from elasticsearch import AsyncElasticsearch  # elasticsearch v8.0+
from elasticsearch.exceptions import NotFoundError, ConnectionError  # elasticsearch v8.0+
from circuitbreaker import circuit_breaker  # circuitbreaker v1.4+
from redis import Redis  # redis v4.0+
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import logging
import json
from functools import wraps

# Internal imports
from ...models.detection import Detection
from ...core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

def retry(max_retries=3):
    """Decorator for retrying failed operations"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    logger.warning(f"Retry attempt {attempt + 1} failed: {str(e)}")
            raise last_error
        return wrapper
    return decorator

class SearchService:
    """
    Advanced service class for managing search operations using Elasticsearch with 
    support for caching, analytics, and health monitoring.
    """
    
    # Class constants
    DETECTION_INDEX = "detections"
    INTELLIGENCE_INDEX = "intelligence"
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100
    QUERY_TIMEOUT = 30  # seconds
    MAX_RETRIES = 3
    CACHE_TTL = 300  # 5 minutes

    def __init__(self, cache_client: Redis):
        """
        Initialize SearchService with Elasticsearch connection and supporting services.
        
        Args:
            cache_client: Redis client instance for caching
        """
        # Initialize Elasticsearch client with connection pooling
        self._client = AsyncElasticsearch(
            hosts=[{
                'host': settings.ELASTICSEARCH_HOST,
                'port': settings.ELASTICSEARCH_PORT,
                'scheme': 'https' if settings.SSL_CERT_PATH else 'http'
            }],
            basic_auth=(
                'elastic',
                settings.ELASTICSEARCH_PASSWORD.get_secret_value()
            ),
            verify_certs=True if settings.SSL_CERT_PATH else False,
            ca_certs=settings.SSL_CERT_PATH if settings.SSL_CERT_PATH else None,
            retry_on_timeout=True,
            max_retries=self.MAX_RETRIES,
            timeout=self.QUERY_TIMEOUT,
            sniff_on_start=True,
            sniff_on_connection_fail=True,
            sniffer_timeout=60
        )

        # Initialize cache client
        self._cache = cache_client

        # Initialize index mappings
        self._init_index_mappings()

    async def _init_index_mappings(self):
        """Initialize Elasticsearch index mappings"""
        detection_mapping = {
            "mappings": {
                "properties": {
                    "id": {"type": "keyword"},
                    "name": {
                        "type": "text",
                        "fields": {
                            "keyword": {"type": "keyword"},
                            "suggest": {"type": "completion"}
                        }
                    },
                    "description": {"type": "text"},
                    "metadata": {"type": "object"},
                    "logic": {"type": "object"},
                    "mitre_mapping": {"type": "object"},
                    "status": {"type": "keyword"},
                    "platform": {"type": "keyword"},
                    "created_at": {"type": "date"},
                    "updated_at": {"type": "date"}
                }
            },
            "settings": {
                "number_of_shards": 3,
                "number_of_replicas": 1,
                "refresh_interval": "1s"
            }
        }

        try:
            if not await self._client.indices.exists(index=self.DETECTION_INDEX):
                await self._client.indices.create(
                    index=self.DETECTION_INDEX,
                    body=detection_mapping
                )
                logger.info(f"Created index {self.DETECTION_INDEX}")
        except Exception as e:
            logger.error(f"Failed to initialize index mappings: {str(e)}")
            raise

    @circuit_breaker(failure_threshold=5, recovery_timeout=60)
    @retry(max_retries=3)
    async def search_detections(
        self,
        query: str,
        filters: Optional[Dict] = None,
        page: int = 1,
        size: int = DEFAULT_PAGE_SIZE,
        sort_options: Optional[Dict] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Advanced search for detections with caching and analytics.
        
        Args:
            query: Search query string
            filters: Optional filters dictionary
            page: Page number (1-based)
            size: Results per page
            sort_options: Optional sorting configuration
            use_cache: Whether to use cache
            
        Returns:
            Dict containing search results with pagination and analytics
        """
        try:
            # Validate parameters
            size = min(size, self.MAX_PAGE_SIZE)
            page = max(1, page)
            from_idx = (page - 1) * size

            # Generate cache key
            cache_key = f"search:{query}:{json.dumps(filters)}:{page}:{size}:{json.dumps(sort_options)}"

            # Check cache if enabled
            if use_cache:
                cached_result = self._cache.get(cache_key)
                if cached_result:
                    return json.loads(cached_result)

            # Build search query
            search_query = {
                "query": {
                    "bool": {
                        "must": [
                            {
                                "multi_match": {
                                    "query": query,
                                    "fields": ["name^3", "description^2", "metadata.*"],
                                    "type": "best_fields",
                                    "fuzziness": "AUTO"
                                }
                            }
                        ],
                        "filter": []
                    }
                },
                "from": from_idx,
                "size": size,
                "sort": sort_options or ["_score"],
                "aggs": {
                    "status_counts": {"terms": {"field": "status"}},
                    "platform_counts": {"terms": {"field": "platform"}},
                    "recent_updates": {
                        "date_histogram": {
                            "field": "updated_at",
                            "calendar_interval": "day"
                        }
                    }
                },
                "suggest": {
                    "name_suggest": {
                        "prefix": query,
                        "completion": {
                            "field": "name.suggest",
                            "fuzzy": {"fuzziness": 2}
                        }
                    }
                }
            }

            # Apply filters if provided
            if filters:
                for field, value in filters.items():
                    if isinstance(value, list):
                        search_query["query"]["bool"]["filter"].append(
                            {"terms": {field: value}}
                        )
                    else:
                        search_query["query"]["bool"]["filter"].append(
                            {"term": {field: value}}
                        )

            # Execute search
            response = await self._client.search(
                index=self.DETECTION_INDEX,
                body=search_query,
                timeout=f"{self.QUERY_TIMEOUT}s"
            )

            # Process results
            results = {
                "total": response["hits"]["total"]["value"],
                "page": page,
                "size": size,
                "results": [hit["_source"] for hit in response["hits"]["hits"]],
                "aggregations": response["aggregations"],
                "suggestions": response["suggest"]["name_suggest"][0]["options"],
                "took_ms": response["took"]
            }

            # Cache results if enabled
            if use_cache:
                self._cache.setex(
                    cache_key,
                    self.CACHE_TTL,
                    json.dumps(results)
                )

            return results

        except Exception as e:
            logger.error(f"Search error: {str(e)}")
            raise

    @retry(max_retries=3)
    async def bulk_index_detections(self, detections: List[Detection]) -> Dict[str, Any]:
        """
        Bulk index multiple detections for improved performance.
        
        Args:
            detections: List of Detection objects to index
            
        Returns:
            Dict containing bulk indexing response
        """
        try:
            if not detections:
                return {"indexed": 0, "errors": []}

            # Prepare bulk indexing payload
            bulk_data = []
            for detection in detections:
                # Add index action
                bulk_data.append({
                    "index": {
                        "_index": self.DETECTION_INDEX,
                        "_id": str(detection.id)
                    }
                })
                # Add document data
                bulk_data.append(detection.to_dict())

            # Execute bulk indexing
            response = await self._client.bulk(
                operations=bulk_data,
                refresh=True,
                timeout=f"{self.QUERY_TIMEOUT}s"
            )

            # Process response
            indexed_count = sum(1 for item in response["items"] if not item.get("error"))
            errors = [
                item["index"]["error"]
                for item in response["items"]
                if item.get("index", {}).get("error")
            ]

            return {
                "indexed": indexed_count,
                "total": len(detections),
                "errors": errors,
                "took_ms": response["took"]
            }

        except Exception as e:
            logger.error(f"Bulk indexing error: {str(e)}")
            raise

    @retry(max_retries=3)
    async def optimize_index(self, index_name: str) -> Dict[str, Any]:
        """
        Optimize index for improved search performance.
        
        Args:
            index_name: Name of the index to optimize
            
        Returns:
            Dict containing optimization response
        """
        try:
            # Force merge to optimize
            merge_response = await self._client.indices.forcemerge(
                index=index_name,
                max_num_segments=1
            )

            # Refresh index
            refresh_response = await self._client.indices.refresh(
                index=index_name
            )

            # Clear field data cache
            cache_response = await self._client.indices.clear_cache(
                index=index_name,
                fielddata=True
            )

            return {
                "status": "success",
                "merge_status": merge_response,
                "refresh_status": refresh_response,
                "cache_status": cache_response
            }

        except Exception as e:
            logger.error(f"Index optimization error: {str(e)}")
            raise

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup"""
        await self._client.close()