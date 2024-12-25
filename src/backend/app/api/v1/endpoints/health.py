# External imports with versions for security tracking
from fastapi import APIRouter, Depends, HTTPException  # fastapi v0.104+
from redis import Redis  # redis v4.0+
from datetime import datetime

# Internal imports
from ....core.config import settings
from ....db.session import get_db

# Initialize router with health check tag
router = APIRouter(tags=["health"], prefix="/health")

# Initialize Redis client with connection from settings
redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

async def check_health(db=Depends(get_db)) -> dict:
    """
    Comprehensive health check endpoint that verifies system component status
    and provides detailed health information.

    Args:
        db: Database session dependency injection

    Returns:
        dict: Detailed health status containing component statuses and metadata

    Raises:
        HTTPException: 503 Service Unavailable if critical components are unhealthy
    """
    # Initialize response with timestamp
    response = {
        "timestamp": datetime.utcnow().isoformat(),
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "status": "healthy",
        "components": {}
    }

    try:
        # Check database health
        db_status = await check_database(db)
        response["components"]["database"] = db_status

        # Check Redis health
        redis_status = await check_redis()
        response["components"]["cache"] = redis_status

        # Determine overall system health
        if not all(component.get("status") == "healthy" 
                  for component in response["components"].values()):
            response["status"] = "degraded"
            raise HTTPException(
                status_code=503,
                detail="One or more system components are unhealthy"
            )

        return response

    except Exception as e:
        response["status"] = "unhealthy"
        response["error"] = str(e)
        raise HTTPException(
            status_code=503,
            detail=f"System health check failed: {str(e)}"
        )

async def check_database(db) -> dict:
    """
    Verifies database connectivity and basic query functionality.

    Args:
        db: Database session

    Returns:
        dict: Database health status with connection details
    """
    start_time = datetime.utcnow()
    try:
        # Execute simple health check query
        db.execute("SELECT 1")
        
        # Calculate query latency
        latency = (datetime.utcnow() - start_time).total_seconds() * 1000

        return {
            "status": "healthy",
            "latency_ms": round(latency, 2),
            "connection": {
                "host": settings.POSTGRES_SERVER,
                "port": settings.POSTGRES_PORT,
                "database": settings.POSTGRES_DB
            }
        }

    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "connection": {
                "host": settings.POSTGRES_SERVER,
                "port": settings.POSTGRES_PORT,
                "database": settings.POSTGRES_DB
            }
        }

async def check_redis() -> dict:
    """
    Verifies Redis cache connectivity and operations.

    Returns:
        dict: Redis health status with connection details
    """
    start_time = datetime.utcnow()
    try:
        # Verify Redis connectivity with PING
        redis_client.ping()
        
        # Calculate operation latency
        latency = (datetime.utcnow() - start_time).total_seconds() * 1000

        return {
            "status": "healthy",
            "latency_ms": round(latency, 2),
            "connection": {
                "host": settings.REDIS_HOST,
                "port": settings.REDIS_PORT
            }
        }

    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "connection": {
                "host": settings.REDIS_HOST,
                "port": settings.REDIS_PORT
            }
        }

# Register health check endpoints
router.get(
    "/",
    response_model=dict,
    summary="System Health Check",
    description="Verify system component availability and health status"
)(check_health)

# Additional status endpoint for monitoring systems
router.get(
    "/status",
    response_model=dict,
    include_in_schema=False
)(check_health)