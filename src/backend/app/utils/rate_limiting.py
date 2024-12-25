"""
Enterprise-grade distributed rate limiting implementation using Redis-backed token bucket algorithm
with atomic operations, async support, and comprehensive monitoring capabilities.

Versions:
- redis: 4.0+
- datadog: 0.44.0+
"""

import asyncio
import time
from typing import Dict, Tuple, Optional
from redis import Redis
from datadog import statsd
from ..core.config import settings
from ..core.logging import get_logger

# Configure logger with rate limiting context
logger = get_logger(__name__, {"component": "rate_limiter"})

# Lua script for atomic rate limit operations using token bucket algorithm
RATE_LIMIT_SCRIPT = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current_time = tonumber(ARGV[3])

-- Initialize or get bucket
local bucket = redis.call('hmget', key, 'tokens', 'last_update')
local tokens = tonumber(bucket[1])
local last_update = tonumber(bucket[2])

if tokens == nil then
    tokens = limit
    last_update = current_time
end

-- Calculate token replenishment
local delta_time = current_time - last_update
local new_tokens = math.min(limit, tokens + (delta_time * limit / window))

-- Attempt to consume token
local allowed = new_tokens >= 1
if allowed then
    new_tokens = new_tokens - 1
end

-- Update bucket state
redis.call('hmset', key, 'tokens', new_tokens, 'last_update', current_time)
redis.call('expire', key, window)

-- Calculate reset time and retry after
local reset_time = current_time + window
local retry_after = 0
if not allowed then
    retry_after = math.ceil((1 - new_tokens) * window / limit)
end

return {allowed and 1 or 0, new_tokens, reset_time, retry_after}
"""

# Default configuration values
DEFAULT_RATE_LIMIT = 1000  # requests per minute
RATE_LIMIT_WINDOW = 60  # seconds
REDIS_TIMEOUT = 5  # seconds
REDIS_RETRY_COUNT = 3  # number of retries for Redis operations

class RateLimiter:
    """
    Enterprise-grade distributed rate limiter using Redis-backed token bucket algorithm
    with atomic operations and comprehensive monitoring.
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        default_limit: int = DEFAULT_RATE_LIMIT,
        window_seconds: int = RATE_LIMIT_WINDOW,
        endpoint_limits: Optional[Dict[str, int]] = None
    ):
        """
        Initialize rate limiter with Redis connection pool and monitoring.

        Args:
            redis_url: Redis connection URL (defaults to settings)
            default_limit: Default rate limit per window
            window_seconds: Rate limit window duration in seconds
            endpoint_limits: Optional endpoint-specific rate limits
        """
        # Initialize Redis connection with retry and timeout settings
        self._redis_client = Redis.from_url(
            redis_url or settings.get_redis_url(),
            socket_timeout=REDIS_TIMEOUT,
            socket_connect_timeout=REDIS_TIMEOUT,
            retry_on_timeout=True,
            decode_responses=True
        )

        # Store configuration
        self._window_seconds = window_seconds
        self._default_limit = default_limit
        self._endpoint_limits = endpoint_limits or {}

        # Load Lua script into Redis
        try:
            self._script_hash = self._redis_client.script_load(RATE_LIMIT_SCRIPT)
        except Exception as e:
            logger.error("Failed to load rate limit script", error=str(e))
            raise

        # Initialize monitoring
        statsd.gauge('rate_limiter.window_seconds', self._window_seconds)
        statsd.gauge('rate_limiter.default_limit', self._default_limit)

        logger.info(
            "Rate limiter initialized",
            window_seconds=window_seconds,
            default_limit=default_limit,
            endpoint_limits=endpoint_limits
        )

    async def is_rate_limited(
        self,
        client_id: str,
        endpoint: str,
        limit: Optional[int] = None
    ) -> Tuple[bool, float, int, int]:
        """
        Check if client has exceeded rate limit using atomic operations.

        Args:
            client_id: Unique client identifier
            endpoint: API endpoint being accessed
            limit: Optional override for rate limit

        Returns:
            Tuple containing:
            - is_limited: Whether request is rate limited
            - remaining: Remaining tokens in current window
            - reset_time: Time when the rate limit resets
            - retry_after: Seconds to wait before retrying if limited
        """
        # Get endpoint-specific limit or use provided/default
        rate_limit = limit or self._endpoint_limits.get(endpoint, self._default_limit)

        # Generate Redis key with namespace
        key = f"ratelimit:{endpoint}:{client_id}"

        # Execute rate limit check with retries
        for attempt in range(REDIS_RETRY_COUNT):
            try:
                # Execute atomic Lua script
                current_time = int(time.time())
                result = self._redis_client.evalsha(
                    self._script_hash,
                    1,  # number of keys
                    key,  # key
                    rate_limit,  # limit
                    self._window_seconds,  # window
                    current_time  # current time
                )

                allowed, remaining, reset_time, retry_after = result
                is_limited = not bool(allowed)

                # Record metrics
                statsd.increment(
                    'rate_limiter.requests',
                    tags=[f'endpoint:{endpoint}', f'limited:{is_limited}']
                )
                statsd.gauge(
                    'rate_limiter.remaining_tokens',
                    remaining,
                    tags=[f'endpoint:{endpoint}', f'client:{client_id}']
                )

                # Log rate limit events
                if is_limited:
                    logger.warning(
                        "Rate limit exceeded",
                        client_id=client_id,
                        endpoint=endpoint,
                        retry_after=retry_after
                    )
                
                return is_limited, remaining, reset_time, retry_after

            except Exception as e:
                logger.error(
                    "Rate limit check failed",
                    error=str(e),
                    attempt=attempt + 1,
                    client_id=client_id,
                    endpoint=endpoint
                )
                if attempt == REDIS_RETRY_COUNT - 1:
                    # On final retry, fail open but log the error
                    statsd.increment('rate_limiter.errors')
                    return False, rate_limit, int(time.time()) + self._window_seconds, 0
                await asyncio.sleep(0.1 * (attempt + 1))  # Exponential backoff

    async def reset(self, client_id: str, endpoint: str) -> bool:
        """
        Reset rate limit for a client with monitoring.

        Args:
            client_id: Client identifier to reset
            endpoint: Endpoint to reset limit for

        Returns:
            bool: Success status
        """
        key = f"ratelimit:{endpoint}:{client_id}"
        try:
            await self._redis_client.delete(key)
            statsd.increment(
                'rate_limiter.resets',
                tags=[f'endpoint:{endpoint}', f'client:{client_id}']
            )
            logger.info(
                "Rate limit reset",
                client_id=client_id,
                endpoint=endpoint
            )
            return True
        except Exception as e:
            logger.error(
                "Rate limit reset failed",
                error=str(e),
                client_id=client_id,
                endpoint=endpoint
            )
            statsd.increment('rate_limiter.reset_errors')
            return False

    def update_limits(self, new_limits: Dict[str, int]) -> bool:
        """
        Update rate limits for endpoints dynamically.

        Args:
            new_limits: Dictionary of endpoint to rate limit mappings

        Returns:
            bool: Success status
        """
        try:
            # Validate new limits
            for endpoint, limit in new_limits.items():
                if limit < 1:
                    raise ValueError(f"Invalid rate limit for {endpoint}: {limit}")

            # Update limits
            self._endpoint_limits.update(new_limits)

            # Record configuration change
            statsd.event(
                "Rate limits updated",
                f"Updated limits for {len(new_limits)} endpoints",
                alert_type="info"
            )

            logger.info(
                "Rate limits updated",
                new_limits=new_limits
            )
            return True

        except Exception as e:
            logger.error(
                "Failed to update rate limits",
                error=str(e),
                new_limits=new_limits
            )
            statsd.increment('rate_limiter.update_errors')
            return False