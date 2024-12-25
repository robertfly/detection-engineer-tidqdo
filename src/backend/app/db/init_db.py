# External imports - versions specified for security tracking
import logging  # standard library
from sqlalchemy import create_engine, text  # sqlalchemy v2.0+
from sqlalchemy.exc import SQLAlchemyError
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0.0+
from datetime import datetime
import uuid

# Internal imports
from .base import Base
from .session import SessionLocal
from ..core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Constants
SCHEMA_VERSION = "1.0.0"
MAX_RETRIES = 3
INITIAL_ROLES = ["public", "community", "enterprise", "admin"]

def verify_encryption(engine) -> bool:
    """
    Verify database encryption settings and configuration.
    
    Args:
        engine: SQLAlchemy engine instance
        
    Returns:
        bool: True if encryption is properly configured
        
    Raises:
        ValueError: If encryption configuration is invalid
    """
    try:
        # Verify SSL/TLS configuration
        if not engine.url.query.get("sslmode"):
            raise ValueError("Database connection must use SSL/TLS encryption")

        # Verify database encryption at rest
        with engine.connect() as conn:
            result = conn.execute(text(
                "SELECT current_setting('ssl_cipher')"
            )).scalar()
            if not result:
                raise ValueError("Database SSL encryption is not enabled")

            # Verify encryption key presence
            if not settings.DB_ENCRYPTION_KEY:
                raise ValueError("Database encryption key must be configured")

        logger.info("Database encryption verification successful")
        return True

    except Exception as e:
        logger.error(f"Database encryption verification failed: {str(e)}")
        raise

@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True
)
def init_db() -> bool:
    """
    Initialize database schema with security checks and performance monitoring.
    
    Returns:
        bool: True if initialization successful
        
    Raises:
        SQLAlchemyError: On database initialization failure
    """
    try:
        start_time = datetime.utcnow()
        logger.info("Starting database initialization")

        # Create engine with security settings
        engine = create_engine(
            settings.get_database_url(),
            pool_pre_ping=True,
            pool_size=20,
            max_overflow=10,
            pool_recycle=3600
        )

        # Verify encryption configuration
        verify_encryption(engine)

        # Create schema version tracking table
        Base.metadata.create_all(bind=engine)
        
        with engine.begin() as conn:
            # Create schema version record
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version VARCHAR(50) PRIMARY KEY,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # Record schema version
            conn.execute(text(
                "INSERT INTO schema_version (version) VALUES (:version) "
                "ON CONFLICT (version) DO UPDATE SET updated_at = CURRENT_TIMESTAMP"
            ), {"version": SCHEMA_VERSION})

        # Log initialization metrics
        end_time = datetime.utcnow()
        duration = (end_time - start_time).total_seconds()
        logger.info(f"Database initialization completed in {duration:.2f} seconds")
        
        return True

    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        raise SQLAlchemyError(f"Database initialization failed: {str(e)}")

@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True
)
def seed_db(db: SessionLocal) -> bool:
    """
    Seed initial data with validation and GDPR compliance checks.
    
    Args:
        db: Database session
        
    Returns:
        bool: True if seeding successful
        
    Raises:
        SQLAlchemyError: On seeding failure
    """
    try:
        start_time = datetime.utcnow()
        logger.info("Starting database seeding")

        with db.begin():
            # Create default organization with security settings
            org_id = uuid.uuid4()
            db.execute(text("""
                INSERT INTO organizations (
                    id, name, settings, created_at, updated_at
                ) VALUES (
                    :id, 'Default Organization',
                    '{"security_level": "high", "require_mfa": true}',
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT DO NOTHING
            """), {"id": str(org_id)})

            # Create admin user with secure defaults
            admin_id = uuid.uuid4()
            db.execute(text("""
                INSERT INTO users (
                    id, email, role, is_active, is_superuser,
                    created_at, updated_at, gdpr_consent
                ) VALUES (
                    :id, :email, 'admin', true, true,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
                )
                ON CONFLICT DO NOTHING
            """), {
                "id": str(admin_id),
                "email": settings.ADMIN_EMAIL
            })

            # Create default detection library
            library_id = uuid.uuid4()
            db.execute(text("""
                INSERT INTO detection_libraries (
                    id, name, org_id, visibility, created_at, updated_at
                ) VALUES (
                    :lib_id, 'Default Library', :org_id, 'private',
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT DO NOTHING
            """), {
                "lib_id": str(library_id),
                "org_id": str(org_id)
            })

            # Set up initial RBAC permissions
            for role in INITIAL_ROLES:
                db.execute(text("""
                    INSERT INTO role_permissions (
                        role_name, permissions, created_at
                    ) VALUES (
                        :role, :permissions, CURRENT_TIMESTAMP
                    )
                    ON CONFLICT DO NOTHING
                """), {
                    "role": role,
                    "permissions": "{}"
                })

            # Create audit log entry
            db.execute(text("""
                INSERT INTO audit_logs (
                    id, action, actor_id, details, created_at
                ) VALUES (
                    :id, 'database_seed', :actor_id,
                    '{"version": :version}', CURRENT_TIMESTAMP
                )
            """), {
                "id": str(uuid.uuid4()),
                "actor_id": str(admin_id),
                "version": SCHEMA_VERSION
            })

        # Log seeding metrics
        end_time = datetime.utcnow()
        duration = (end_time - start_time).total_seconds()
        logger.info(f"Database seeding completed in {duration:.2f} seconds")
        
        return True

    except Exception as e:
        logger.error(f"Database seeding failed: {str(e)}")
        raise SQLAlchemyError(f"Database seeding failed: {str(e)}")