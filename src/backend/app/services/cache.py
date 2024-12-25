"""
Redis cache service implementation with cluster mode support, connection pooling,
and comprehensive monitoring capabilities.

Versions:
- redis: 4.5+
- json: standard library
- pickle: standard library
- zlib: standard library
"""

import json
import pickle
import zlib
import time
from typing import Any, Optional, Dict
from redis import Redis, ConnectionPool
from redis.cluster import RedisCluster
from redis.exceptions import RedisError

from ..core.config import get_redis_url, REDIS_CLUSTER_NODES, REDIS_CLUSTER_MODE, REDIS_MAX_CONNECTIONS
from ..core.logging import get_logger

# Configure logger
logger = get_logger(__name__)

# Constants
DEFAULT_TTL = 86400  # 24 hours in seconds
COMPRESSION_THRESHOLD = 1024  # Compress values larger than 1KB
MAX_RETRIES = 3  # Maximum number of retry attempts
RETRY_DELAY = 1.0  # Base delay between retries in seconds

class CacheService:
    """
    Enhanced Redis cache service implementation with cluster mode support,
    connection pooling, and comprehensive monitoring capabilities.
    """

    def __init__(self, prefix: str = "cache:", cluster_mode: bool = REDIS_CLUSTER_MODE,
                 max_connections: int = REDIS_MAX_CONNECTIONS) -> None:
        """
        Initialize Redis client with cluster mode and connection pooling.

        Args:
            prefix: Cache key prefix for namespace isolation
            cluster_mode: Enable Redis cluster mode
            max_connections: Maximum number of connections in the pool
        """
        self._stats = {
            "hits": 0,
            "misses": 0,
            "errors": 0,
            "total_get_time": 0,
            "total_set_time": 0,
            "operations": 0
        }
        
        try:
            if cluster_mode:
                # Initialize cluster connection
                self._client = RedisCluster(
                    startup_nodes=REDIS_CLUSTER_NODES,
                    decode_responses=True,
                    skip_full_coverage_check=True,
                    max_connections=max_connections
                )
            else:
                # Initialize single instance connection pool
                self._pool = ConnectionPool.from_url(
                    url=get_redis_url(),
                    max_connections=max_connections,
                    decode_responses=True
                )
                self._client = Redis(connection_pool=self._pool)

            self._prefix = prefix
            
            # Verify connection
            self._client.ping()
            logger.info("Cache service initialized successfully",
                       cluster_mode=cluster_mode,
                       max_connections=max_connections)
            
        except RedisError as e:
            logger.error("Failed to initialize cache service",
                        error=str(e),
                        cluster_mode=cluster_mode)
            raise

    def get(self, key: str) -> Optional[Any]:
        """
        Retrieve and decompress value from cache with monitoring.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found
        """
        start_time = time.time()
        prefixed_key = f"{self._prefix}{key}"
        
        try:
            for attempt in range(MAX_RETRIES):
                try:
                    value = self._client.get(prefixed_key)
                    
                    if value is None:
                        self._stats["misses"] += 1
                        logger.debug("Cache miss", key=key)
                        return None
                    
                    # Handle compressed values
                    if value.startswith(b"\x78\x9c"):  # zlib magic number
                        value = zlib.decompress(value)
                    
                    # Deserialize based on type
                    if value.startswith(b"{") or value.startswith(b"["):
                        result = json.loads(value)
                    else:
                        result = pickle.loads(value)
                    
                    self._stats["hits"] += 1
                    self._stats["total_get_time"] += time.time() - start_time
                    self._stats["operations"] += 1
                    
                    logger.debug("Cache hit", key=key, value_size=len(value))
                    return result
                
                except RedisError as e:
                    if attempt == MAX_RETRIES - 1:
                        raise
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    
        except Exception as e:
            self._stats["errors"] += 1
            logger.error("Cache get error",
                        key=key,
                        error=str(e),
                        attempt=attempt + 1)
            return None

    def set(self, key: str, value: Any, ttl: int = DEFAULT_TTL) -> bool:
        """
        Store and compress value in cache with monitoring.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds

        Returns:
            Success status
        """
        start_time = time.time()
        prefixed_key = f"{self._prefix}{key}"
        
        try:
            # Serialize value
            if isinstance(value, (dict, list)):
                serialized = json.dumps(value).encode()
            else:
                serialized = pickle.dumps(value)
            
            # Compress if above threshold
            if len(serialized) > COMPRESSION_THRESHOLD:
                serialized = zlib.compress(serialized)
            
            for attempt in range(MAX_RETRIES):
                try:
                    success = self._client.setex(
                        prefixed_key,
                        ttl,
                        serialized
                    )
                    
                    self._stats["total_set_time"] += time.time() - start_time
                    self._stats["operations"] += 1
                    
                    logger.debug("Cache set successful",
                               key=key,
                               value_size=len(serialized),
                               ttl=ttl)
                    return success
                
                except RedisError as e:
                    if attempt == MAX_RETRIES - 1:
                        raise
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    
        except Exception as e:
            self._stats["errors"] += 1
            logger.error("Cache set error",
                        key=key,
                        error=str(e),
                        value_size=len(serialized) if 'serialized' in locals() else None,
                        attempt=attempt + 1)
            return False

    def health_check(self) -> Dict:
        """
        Verify cache service health and cluster status.

        Returns:
            Health status information
        """
        try:
            # Basic connection check
            ping_latency = time.time()
            self._client.ping()
            ping_latency = time.time() - ping_latency
            
            # Get cluster info if applicable
            cluster_info = None
            if isinstance(self._client, RedisCluster):
                cluster_info = {
                    "cluster_size": len(self._client.get_nodes()),
                    "cluster_state": self._client.cluster("info"),
                }
            
            # Get memory usage
            memory_info = self._client.info("memory")
            
            return {
                "status": "healthy",
                "ping_latency_ms": round(ping_latency * 1000, 2),
                "cluster_info": cluster_info,
                "memory_usage_bytes": memory_info.get("used_memory"),
                "max_memory_bytes": memory_info.get("maxmemory"),
                "connected_clients": self._client.info().get("connected_clients"),
                "last_error": None
            }
            
        except Exception as e:
            logger.error("Health check failed", error=str(e))
            return {
                "status": "unhealthy",
                "error": str(e),
                "last_error": time.time()
            }

    def get_stats(self) -> Dict:
        """
        Retrieve cache operation statistics.

        Returns:
            Cache statistics
        """
        total_ops = self._stats["hits"] + self._stats["misses"]
        avg_get_time = (
            self._stats["total_get_time"] / total_ops if total_ops > 0 else 0
        )
        avg_set_time = (
            self._stats["total_set_time"] / self._stats["operations"]
            if self._stats["operations"] > 0 else 0
        )
        
        return {
            "hit_ratio": self._stats["hits"] / total_ops if total_ops > 0 else 0,
            "miss_ratio": self._stats["misses"] / total_ops if total_ops > 0 else 0,
            "error_count": self._stats["errors"],
            "total_operations": self._stats["operations"],
            "avg_get_time_ms": round(avg_get_time * 1000, 2),
            "avg_set_time_ms": round(avg_set_time * 1000, 2),
            "memory_usage": self._client.info("memory").get("used_memory_human")
        }