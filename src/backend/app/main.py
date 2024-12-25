"""
Main FastAPI application entry point with comprehensive security controls,
monitoring, and high availability features.

Versions:
- fastapi: 0.104+
- prometheus_client: 0.17+
- redis: 4.5+
- circuitbreaker: 1.4+
"""

from fastapi import FastAPI, HTTPException, Request, RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from circuitbreaker import circuit
import logging
import time
from typing import Dict

# Internal imports
from .config import settings
from .api.v1 import api_router
from .core.events import startup_event_handler, shutdown_event_handler
from .core.logging import configure_logging, get_logger

# Initialize logger
logger = get_logger(__name__, {"service": "main_app"})

def create_application() -> FastAPI:
    """
    Create and configure FastAPI application with comprehensive security
    and monitoring features.

    Returns:
        FastAPI: Configured application instance
    """
    # Initialize FastAPI with enhanced configuration
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="AI-Driven Detection Engineering Platform API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        debug=settings.ENVIRONMENT != "production"
    )

    # Configure logging
    configure_logging()

    # Add security middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-API-Version"]
    )

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"] if settings.ENVIRONMENT != "production" else ["api.detectionplatform.com"]
    )

    # Add compression middleware
    app.add_middleware(
        GZipMiddleware,
        minimum_size=1000
    )

    # Add custom security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    # Add request ID middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request.state.request_id = str(time.time())
        return await call_next(request)

    # Add performance monitoring middleware
    @app.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response

    # Configure Prometheus metrics
    Instrumentator().instrument(app).expose(app, include_in_schema=False)

    # Add API router
    app.include_router(
        api_router,
        prefix=settings.API_V1_PREFIX
    )

    # Configure startup and shutdown events
    app.add_event_handler("startup", startup_event_handler)
    app.add_event_handler("shutdown", shutdown_event_handler)

    # Add health check endpoints
    @app.get("/health")
    @circuit(failure_threshold=5, recovery_timeout=60)
    async def health_check() -> Dict:
        """Enhanced health check endpoint with circuit breaker."""
        return {
            "status": "healthy",
            "version": "1.0.0",
            "environment": settings.ENVIRONMENT,
            "timestamp": time.time()
        }

    @app.get("/readiness")
    async def readiness_check() -> Dict:
        """Readiness probe for Kubernetes."""
        return {
            "status": "ready",
            "timestamp": time.time()
        }

    # Configure error handlers
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Enhanced validation error handler with detailed error reporting."""
        logger.error(
            "Request validation failed",
            errors=exc.errors(),
            body=exc.body,
            request_id=request.state.request_id
        )
        return JSONResponse(
            status_code=422,
            content={
                "detail": exc.errors(),
                "body": exc.body,
                "request_id": request.state.request_id
            }
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        """Enhanced HTTP exception handler with request tracking."""
        logger.error(
            "HTTP exception occurred",
            status_code=exc.status_code,
            detail=exc.detail,
            request_id=request.state.request_id
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "request_id": request.state.request_id
            },
            headers=exc.headers
        )

    return app

# Create application instance
app = create_application()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT != "production",
        workers=4,
        log_level="info"
    )