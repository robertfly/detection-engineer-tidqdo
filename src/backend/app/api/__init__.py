"""
Main API module initializer that configures and exports the FastAPI router hierarchy,
combining versioned API routers and core dependencies.

Versions:
- fastapi: 0.104+
- prometheus_client: 0.17+
- structlog: 23.1+
"""

from fastapi import APIRouter
from prometheus_client import Counter, Histogram
import structlog

# Internal imports
from .v1 import router as v1_router
from ..core.logging import get_logger

# Initialize logger
logger = get_logger(__name__, {"service": "api_router"})

# Initialize metrics
API_REQUEST_COUNTER = Counter(
    "api_requests_total",
    "Total number of API requests",
    ["version", "method", "endpoint"]
)

API_LATENCY = Histogram(
    "api_request_latency_seconds",
    "API request latency in seconds",
    ["version", "method", "endpoint"]
)

# Initialize root router with prefix and tags
root_router = APIRouter(prefix="/api", tags=["api"])

# Include versioned routers
root_router.include_router(
    v1_router,
    prefix="/v1",
    tags=["v1"]
)

# Log router initialization
logger.info(
    "API router hierarchy initialized",
    versions=["v1"],
    base_prefix="/api"
)

# Export root router
__all__ = ["root_router"]