"""
Main entry point for the utils package providing centralized, type-safe, and well-documented
access to common utility functions. Implements careful exposure control, comprehensive
documentation, and proper type hints while maintaining security through controlled exports.

Version: 1.0.0
"""

# External imports - versions specified for security tracking
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from uuid import UUID

# Internal imports with explicit type hints
from .formatting import (
    format_detection_id,  # Type-safe detection ID formatting
    format_intelligence_id,  # Type-safe intelligence ID formatting
    format_datetime  # ISO-8601 compliant datetime formatting
)

from .pagination import (
    PaginationParams,  # Type-safe pagination parameter handling
    PaginatedResponse  # Generic paginated response wrapper
)

from .security import (
    sanitize_html,  # XSS-safe HTML content sanitization
    validate_email  # RFC 5322 compliant email validation
)

from .validation import (
    validate_detection_format  # UDF-compliant detection format validation
)

from .rate_limiting import (
    RateLimiter  # Redis-backed rate limiting
)

# Package version tracking
__version__ = '1.0.0'

# Carefully controlled public exports
__all__: List[str] = [
    # Formatting utilities
    'format_detection_id',
    'format_intelligence_id', 
    'format_datetime',
    
    # Pagination utilities
    'PaginationParams',
    'PaginatedResponse',
    
    # Security utilities
    'sanitize_html',
    'validate_email',
    
    # Validation utilities
    'validate_detection_format',
    
    # Rate limiting utilities
    'RateLimiter'
]

# Type hints for exported functions and classes
FormatDetectionID = Callable[[UUID], str]
FormatIntelligenceID = Callable[[UUID], str]
FormatDateTime = Callable[[datetime], str]
SanitizeHTML = Callable[[str], str]
ValidateEmail = Callable[[str], bool]
ValidateDetectionFormat = Callable[
    [Dict[str, Any]], 
    tuple[bool, Optional[str], Dict[str, Any]]
]

# Documentation for exported items
format_detection_id.__doc__ = """
Format detection ID with type safety and validation.

Args:
    detection_id: UUID of the detection

Returns:
    str: Formatted detection ID string

Raises:
    ValueError: If detection ID is invalid
"""

format_intelligence_id.__doc__ = """
Format intelligence ID with type safety and validation.

Args:
    intelligence_id: UUID of the intelligence item

Returns:
    str: Formatted intelligence ID string

Raises:
    ValueError: If intelligence ID is invalid
"""

format_datetime.__doc__ = """
Format datetime to ISO-8601 compliant string.

Args:
    dt: datetime object to format

Returns:
    str: ISO-8601 formatted datetime string
"""

PaginationParams.__doc__ = """
Type-safe pagination parameter handling with validation.

Attributes:
    page_size: Number of items per page
    cursor: Optional cursor for pagination
"""

PaginatedResponse.__doc__ = """
Generic paginated response wrapper with type safety.

Attributes:
    items: List of paginated items
    total: Total number of items
    links: Pagination links
"""

sanitize_html.__doc__ = """
XSS-safe HTML content sanitization.

Args:
    html: HTML content to sanitize

Returns:
    str: Sanitized HTML content
"""

validate_email.__doc__ = """
RFC 5322 compliant email validation.

Args:
    email: Email address to validate

Returns:
    bool: True if email is valid
"""

validate_detection_format.__doc__ = """
UDF-compliant detection format validation.

Args:
    detection: Detection data to validate

Returns:
    tuple: (is_valid, error_message, validation_metadata)
"""

RateLimiter.__doc__ = """
Redis-backed rate limiting with configurable windows.

Methods:
    is_rate_limited: Check if request is rate limited
    reset: Reset rate limit counters
"""