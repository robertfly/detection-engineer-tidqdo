# External imports - versions specified for security tracking
from sqlalchemy import create_engine  # sqlalchemy v2.0+
from sqlalchemy.orm import sessionmaker, declarative_base  # sqlalchemy v2.0+
from typing import Generator
import logging
import contextlib

# Internal imports
from ..core.config import settings

# Configure logging for database operations
logger = logging.getLogger(__name__)

# Create SQLAlchemy engine with optimized connection pooling settings
engine = create_engine(
    settings.get_database_url(),
    # Enable connection health checks to detect stale connections
    pool_pre_ping=True,
    # Optimize connection pool size based on requirements
    pool_size=20,
    max_overflow=10,
    # Recycle connections after 1 hour to prevent stale connections
    pool_recycle=3600,
    # Set connection timeout to prevent hanging
    pool_timeout=30,
    # Disable SQL echo in production for security
    echo=False,
    # Additional connection arguments for reliability
    connect_args={
        'connect_timeout': 10,
        'application_name': 'detection_platform'
    }
)

# Create sessionmaker with optimized settings
SessionLocal = sessionmaker(
    # Disable autocommit for explicit transaction management
    autocommit=False,
    # Disable autoflush for better performance
    autoflush=False,
    # Bind to our configured engine
    bind=engine,
    # Disable expire on commit for better performance
    expire_on_commit=False
)

# Create declarative base for models
Base = declarative_base()

def get_db() -> Generator[SessionLocal, None, None]:
    """
    FastAPI dependency for database session management with automatic cleanup.
    
    Implements connection pooling optimizations and proper resource management
    to maintain high performance and reliability.
    
    Yields:
        SessionLocal: Database session that auto-closes with proper resource cleanup
        
    Raises:
        SQLAlchemyError: For any database-related errors
    """
    db = SessionLocal()
    try:
        # Log session creation for monitoring
        logger.debug("Creating new database session")
        
        # Verify connection is healthy before use
        db.execute("SELECT 1")
        
        # Provide session to caller
        yield db
        
        # Commit any pending changes if no exceptions occurred
        db.commit()
        logger.debug("Successfully committed database transaction")
        
    except Exception as e:
        # Rollback transaction on error
        db.rollback()
        logger.error(f"Database error occurred: {str(e)}")
        raise
    
    finally:
        # Ensure session is closed and returned to pool
        db.close()
        logger.debug("Closed database session and returned to pool")

# Export Base for model definitions
__all__ = ["Base", "get_db"]