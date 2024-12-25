"""
Application initialization module that configures and exports the FastAPI application instance
with comprehensive platform integration support, health monitoring, and enhanced error handling.

Versions:
- fastapi: 0.104.0
- circuitbreaker: 1.4.0
- prometheus_client: 0.17.1
- fastapi_healthcheck: 1.0.0
"""

from fastapi import FastAPI
from circuitbreaker import circuit
from prometheus_client import Counter, Histogram, Gauge
from fastapi_healthcheck import HealthCheck

# Internal imports
from app.core.config import get_settings
from app.main import get_application

# Initialize settings and metrics
settings = get_settings()

# Prometheus metrics
METRICS = {
    'http_requests_total': Counter(
        'http_requests_total',
        'Total HTTP requests',
        ['method', 'endpoint', 'status']
    ),
    'http_request_duration_seconds': Histogram(
        'http_request_duration_seconds',
        'HTTP request duration in seconds',
        ['method', 'endpoint']
    ),
    'active_connections': Gauge(
        'active_connections',
        'Number of active connections'
    )
}

# Health check instance
health = HealthCheck()

@circuit(failure_threshold=5, recovery_timeout=60)
def get_app() -> FastAPI:
    """
    Factory function that returns the configured FastAPI application instance
    with all middleware, event handlers, and platform integrations.

    Returns:
        FastAPI: Fully configured FastAPI application instance
    """
    # Get base application instance
    app = get_application()

    # Configure startup handler
    configure_startup_handler(app)

    # Configure shutdown handler
    configure_shutdown_handler(app)

    # Configure health checks
    app.add_api_route("/health", health, tags=["monitoring"])
    health.add_check(check_database_connection)
    health.add_check(check_redis_connection)
    health.add_check(check_elasticsearch_connection)

    return app

def configure_startup_handler(app: FastAPI) -> None:
    """
    Configures application startup event handlers with comprehensive initialization.

    Args:
        app: FastAPI application instance
    """
    @app.on_event("startup")
    async def startup_event():
        # Initialize database connections
        await initialize_database()

        # Initialize cache
        await initialize_cache()

        # Initialize search index
        await initialize_elasticsearch()

        # Initialize metrics collectors
        initialize_metrics()

        # Configure health check probes
        configure_health_probes()

async def initialize_database():
    """Initialize database connection pool with optimized settings"""
    from app.db.session import get_db
    async with get_db() as db:
        await db.execute("SELECT 1")

async def initialize_cache():
    """Initialize Redis cache with connection pooling"""
    from app.services.cache import CacheService
    cache = CacheService()
    await cache.health_check()

async def initialize_elasticsearch():
    """Initialize Elasticsearch client with optimized settings"""
    from elasticsearch import AsyncElasticsearch
    es = AsyncElasticsearch([settings.ELASTICSEARCH_HOST])
    await es.cluster.health(wait_for_status='yellow')

def initialize_metrics():
    """Initialize Prometheus metrics collectors"""
    METRICS['active_connections'].set(0)

def configure_health_probes():
    """Configure Kubernetes health check probes"""
    health.add_check(check_database_connection)
    health.add_check(check_redis_connection)
    health.add_check(check_elasticsearch_connection)

def configure_shutdown_handler(app: FastAPI) -> None:
    """
    Configures application shutdown event handlers with graceful termination.

    Args:
        app: FastAPI application instance
    """
    @app.on_event("shutdown")
    async def shutdown_event():
        # Close database connections
        await cleanup_database()

        # Close cache connections
        await cleanup_cache()

        # Close search connections
        await cleanup_elasticsearch()

        # Persist metrics state
        persist_metrics()

async def cleanup_database():
    """Gracefully close database connections"""
    from app.db.session import get_db
    async with get_db() as db:
        await db.close()

async def cleanup_cache():
    """Gracefully close Redis connections"""
    from app.services.cache import CacheService
    cache = CacheService()
    await cache.close()

async def cleanup_elasticsearch():
    """Gracefully close Elasticsearch connections"""
    from elasticsearch import AsyncElasticsearch
    es = AsyncElasticsearch([settings.ELASTICSEARCH_HOST])
    await es.close()

def persist_metrics():
    """Persist metrics state before shutdown"""
    # Implementation for metrics persistence

# Health check functions
async def check_database_connection():
    """Health check for database connection"""
    from app.db.session import get_db
    try:
        async with get_db() as db:
            await db.execute("SELECT 1")
        return True, "Database connection healthy"
    except Exception as e:
        return False, f"Database connection failed: {str(e)}"

async def check_redis_connection():
    """Health check for Redis connection"""
    from app.services.cache import CacheService
    try:
        cache = CacheService()
        await cache.health_check()
        return True, "Redis connection healthy"
    except Exception as e:
        return False, f"Redis connection failed: {str(e)}"

async def check_elasticsearch_connection():
    """Health check for Elasticsearch connection"""
    from elasticsearch import AsyncElasticsearch
    try:
        es = AsyncElasticsearch([settings.ELASTICSEARCH_HOST])
        await es.cluster.health()
        return True, "Elasticsearch connection healthy"
    except Exception as e:
        return False, f"Elasticsearch connection failed: {str(e)}"

# Export application instance
app = get_app()