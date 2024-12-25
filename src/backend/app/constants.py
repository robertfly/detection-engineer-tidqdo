"""
Core application constants module for the AI Detection Platform.

This module defines global configuration values, API versioning, security parameters,
and system-wide constants used across the backend application. It includes performance
tuning parameters, integration settings, and operational configurations.

Version: 1.0.0
"""

# Project Identification
# Used in API documentation, logging, and system-wide identification
PROJECT_NAME = "AI Detection Platform"

# API Configuration
# URL prefix for API version 1, enabling versioned API routing
API_V1_PREFIX = "/api/v1"

# CORS Configuration
# List of allowed origins for cross-origin resource sharing
# Production environments should strictly limit these based on deployment requirements
BACKEND_CORS_ORIGINS = [
    "http://localhost:3000",  # Frontend development server
    "http://localhost:8000",  # Backend development server
    "http://localhost"        # Local development fallback
]

# Security Configuration
# JWT authentication parameters
JWT_ALGORITHM = "HS256"  # HMAC with SHA-256
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # Short-lived access token
REFRESH_TOKEN_EXPIRE_DAYS = 7     # Long-lived refresh token

# Detection Formats
# Supported detection rule formats for cross-platform translation
# Follows platform integration matrix specifications
DETECTION_FORMATS = [
    "sigma",   # Sigma generic detection format
    "kql",     # Kusto Query Language (Microsoft Sentinel)
    "spl",     # Search Processing Language (Splunk)
    "yara-l"   # YARA-L format (Chronicle)
]

# Pagination Configuration
# Controls response size and resource utilization
MAX_PAGE_SIZE = 100      # Maximum items per page to prevent resource exhaustion
DEFAULT_PAGE_SIZE = 20   # Default items per page for optimal performance

# Rate Limiting
# Default rate limit for API endpoint protection (requests per minute)
RATE_LIMIT_DEFAULT = 1000  # Enterprise-grade default limit

# Caching Configuration
# Default cache TTL for optimal resource utilization
CACHE_TTL_SECONDS = 3600  # 1 hour default cache duration

# WebSocket Configuration
# Real-time connection maintenance parameters
WEBSOCKET_PING_INTERVAL = 30  # Seconds between ping messages