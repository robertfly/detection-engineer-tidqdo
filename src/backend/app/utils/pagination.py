# External imports with versions for security tracking
from sqlalchemy import select, func, and_, text  # sqlalchemy v2.0+
from pydantic import BaseModel, Field, validator  # pydantic v2.0+
from typing import List, Optional, TypeVar, Generic, Union, Dict
import base64
import json
import logging

# Internal imports
from ..db.session import AsyncSession

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
MIN_PAGE_SIZE = 10
CURSOR_ENCODING_KEY = "base64_encoded_cursor_key"

# Generic type variable for pagination
T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    """
    Generic pydantic model for paginated API responses with cursor-based navigation support.
    
    Attributes:
        items (List[T]): List of paginated items
        total (int): Total number of items
        page (int): Current page number
        size (int): Page size
        next_cursor (Optional[str]): Base64 encoded cursor for next page
        previous_cursor (Optional[str]): Base64 encoded cursor for previous page
        meta (Dict[str, Union[str, int]]): Additional pagination metadata
    """
    items: List[T]
    total: int = Field(..., ge=0)
    page: int = Field(..., ge=1)
    size: int = Field(..., ge=MIN_PAGE_SIZE, le=MAX_PAGE_SIZE)
    next_cursor: Optional[str] = None
    previous_cursor: Optional[str] = None
    meta: Dict[str, Union[str, int]] = {}

    @validator('size')
    def validate_size(cls, value: int) -> int:
        """
        Validate page size against configured limits.
        
        Args:
            value (int): Page size to validate
            
        Returns:
            int: Validated page size
            
        Raises:
            ValueError: If size is outside allowed range
        """
        if value < MIN_PAGE_SIZE:
            raise ValueError(f"Page size must be at least {MIN_PAGE_SIZE}")
        if value > MAX_PAGE_SIZE:
            raise ValueError(f"Page size cannot exceed {MAX_PAGE_SIZE}")
        return value

    def __init__(self, **data):
        """
        Initialize paginated response with enhanced validation.
        
        Args:
            **data: Keyword arguments for response initialization
        """
        super().__init__(**data)
        
        # Generate pagination metadata
        self.meta = {
            "total": self.total,
            "page": self.page,
            "size": self.size,
            "pages": (self.total + self.size - 1) // self.size,
            "has_next": bool(self.next_cursor),
            "has_previous": bool(self.previous_cursor)
        }

async def paginate_query(
    db: AsyncSession,
    query: select,
    page: int = 1,
    size: int = DEFAULT_PAGE_SIZE,
    cursor_params: Optional[Dict] = None
) -> tuple[List, int, Optional[str], Optional[str]]:
    """
    Apply pagination to a SQLAlchemy query with performance optimization.
    
    Args:
        db (AsyncSession): Database session
        query (select): Base SQLAlchemy select query
        page (int): Page number (1-based)
        size (int): Page size
        cursor_params (Optional[Dict]): Optional cursor parameters for cursor-based pagination
        
    Returns:
        Tuple[List, int, Optional[str], Optional[str]]: 
            - List of paginated results
            - Total count
            - Next cursor
            - Previous cursor
            
    Raises:
        ValueError: If pagination parameters are invalid
    """
    try:
        # Validate and normalize parameters
        size = min(max(MIN_PAGE_SIZE, size), MAX_PAGE_SIZE)
        page = max(1, page)
        
        # Calculate offset
        offset = (page - 1) * size
        
        # Optimize count query using EXISTS
        count_query = select(func.count()).select_from(query.subquery())
        total = await db.scalar(count_query)
        
        # Apply pagination
        paginated_query = query.offset(offset).limit(size)
        
        # Execute query with error handling
        try:
            result = await db.execute(paginated_query)
            items = result.scalars().all()
        except Exception as e:
            logger.error(f"Query execution failed: {str(e)}")
            raise
            
        # Generate cursor values if cursor_params provided
        next_cursor = None
        previous_cursor = None
        
        if cursor_params:
            if offset + size < total:
                next_cursor = base64.b64encode(
                    json.dumps({
                        "page": page + 1,
                        "size": size,
                        **cursor_params
                    }).encode()
                ).decode()
                
            if page > 1:
                previous_cursor = base64.b64encode(
                    json.dumps({
                        "page": page - 1,
                        "size": size,
                        **cursor_params
                    }).encode()
                ).decode()
                
        return items, total, next_cursor, previous_cursor
        
    except Exception as e:
        logger.error(f"Pagination failed: {str(e)}")
        raise

def create_paginated_response(
    items: List[T],
    total: int,
    page: int,
    size: int,
    next_cursor: Optional[str] = None,
    previous_cursor: Optional[str] = None
) -> PaginatedResponse[T]:
    """
    Create a standardized paginated response with enhanced metadata.
    
    Args:
        items (List[T]): List of paginated items
        total (int): Total number of items
        page (int): Current page number
        size (int): Page size
        next_cursor (Optional[str]): Base64 encoded cursor for next page
        previous_cursor (Optional[str]): Base64 encoded cursor for previous page
        
    Returns:
        PaginatedResponse[T]: Enhanced paginated response object
        
    Raises:
        ValueError: If input parameters are invalid
    """
    try:
        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            next_cursor=next_cursor,
            previous_cursor=previous_cursor
        )
    except Exception as e:
        logger.error(f"Failed to create paginated response: {str(e)}")
        raise

# Export public interface
__all__ = [
    "PaginatedResponse",
    "paginate_query",
    "create_paginated_response",
    "DEFAULT_PAGE_SIZE",
    "MAX_PAGE_SIZE",
    "MIN_PAGE_SIZE"
]