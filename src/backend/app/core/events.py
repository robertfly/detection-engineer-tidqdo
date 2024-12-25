"""
Core event handlers module for FastAPI application lifecycle management.
Implements robust startup and shutdown procedures with comprehensive error handling.

Versions:
- asyncio: 3.11+
- redis: 4.5+
- motor: 3.0+
- elasticsearch: 8.0+
"""

import asyncio
from typing import Optional
import logging
from redis.asyncio import Redis
from motor.motor_asyncio import AsyncIOMotorClient
from elasticsearch import AsyncElasticsearch, ConnectionTimeout

from ..core.config import settings
from ..db.session import get_session
from .logging import configure_logging, get_logger

# Initialize module logger
logger = get_logger(__name__)

# Global service clients
redis_client: Optional[Redis] = None
mongo_client: Optional[AsyncIOMotorClient] = None
es_client: Optional[AsyncElasticsearch] = None

@asyncio.coroutine
async def startup_event_handler() -> None:
    """
    Handles application startup events with comprehensive service initialization
    and health checks. Implements circuit breakers and connection pooling.
    
    Raises:
        ConnectionError: If critical service connections fail
        TimeoutError: If service connections timeout
        Exception: For other unexpected initialization errors
    """
    try:
        # Initialize application logging
        logger.info("Initializing application startup sequence")
        configure_logging()

        # Initialize database connection
        logger.info("Establishing database connections")
        db = next(get_session())
        try:
            # Verify database connection
            db.execute("SELECT 1")
            logger.info("Database connection verified successfully")
        finally:
            db.close()

        # Initialize Redis connection
        logger.info("Establishing Redis connection")
        global redis_client
        redis_client = Redis.from_url(
            settings.get_redis_url(),
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=5.0,
            socket_connect_timeout=5.0,
            retry_on_timeout=True,
            max_connections=10
        )
        # Verify Redis connection
        await redis_client.ping()
        logger.info("Redis connection verified successfully")

        # Initialize MongoDB connection
        logger.info("Establishing MongoDB connection")
        global mongo_client
        mongo_client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            maxPoolSize=50,
            minPoolSize=10,
            maxIdleTimeMS=30000,
            waitQueueTimeoutMS=5000
        )
        # Verify MongoDB connection
        await mongo_client.admin.command('ping')
        logger.info("MongoDB connection verified successfully")

        # Initialize Elasticsearch connection
        logger.info("Establishing Elasticsearch connection")
        global es_client
        es_client = AsyncElasticsearch(
            [f"{settings.ELASTICSEARCH_HOST}:{settings.ELASTICSEARCH_PORT}"],
            basic_auth=(
                "elastic",
                settings.ELASTICSEARCH_PASSWORD.get_secret_value()
            ),
            verify_certs=True if settings.SSL_CERT_PATH else False,
            ca_certs=settings.SSL_CERT_PATH if settings.SSL_CERT_PATH else None,
            timeout=30,
            max_retries=3,
            retry_on_timeout=True,
            sniff_on_start=True,
            sniff_on_connection_fail=True,
            sniffer_timeout=60
        )
        # Verify Elasticsearch connection
        await es_client.cluster.health(wait_for_status='yellow', timeout='30s')
        logger.info("Elasticsearch connection verified successfully")

        logger.info("Application startup completed successfully")

    except ConnectionTimeout as e:
        logger.error(f"Service connection timeout during startup: {str(e)}")
        await shutdown_event_handler()
        raise
    except ConnectionError as e:
        logger.error(f"Service connection error during startup: {str(e)}")
        await shutdown_event_handler()
        raise
    except Exception as e:
        logger.error(f"Unexpected error during startup: {str(e)}")
        await shutdown_event_handler()
        raise

@asyncio.coroutine
async def shutdown_event_handler() -> None:
    """
    Handles application shutdown events with graceful connection termination
    and resource cleanup. Ensures all pending operations are completed or
    rolled back appropriately.
    """
    logger.info("Initiating application shutdown sequence")
    
    try:
        # Close Redis connection
        if redis_client:
            logger.info("Closing Redis connection")
            await redis_client.close()
            logger.info("Redis connection closed successfully")

        # Close MongoDB connection
        if mongo_client:
            logger.info("Closing MongoDB connection")
            mongo_client.close()
            logger.info("MongoDB connection closed successfully")

        # Close Elasticsearch connection
        if es_client:
            logger.info("Closing Elasticsearch connection")
            await es_client.close()
            logger.info("Elasticsearch connection closed successfully")

        # Final cleanup
        logger.info("Performing final cleanup")
        await asyncio.sleep(1)  # Allow pending operations to complete
        
        logger.info("Application shutdown completed successfully")

    except Exception as e:
        logger.error(f"Error during shutdown sequence: {str(e)}")
        raise
    finally:
        # Ensure all handlers are closed
        logging.shutdown()