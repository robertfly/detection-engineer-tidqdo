# External imports - versions specified for security tracking
from alembic import context  # alembic v1.12+
from alembic import environment  # alembic v1.12+
from sqlalchemy import create_engine  # sqlalchemy v2.0+
from sqlalchemy import pool  # sqlalchemy v2.0+
from logging.config import config as logging_config  # standard library
import logging
import logging.config
import time
from typing import Optional

# Internal imports
from ..base import Base  # Import SQLAlchemy models metadata
from ...core.config import settings  # Import database configuration

# Configure logging for migration tracking
logging.config.dictConfig({
    'version': 1,
    'formatters': {
        'detailed': {
            'class': 'logging.Formatter',
            'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'detailed',
            'level': logging.INFO,
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': 'alembic.log',
            'formatter': 'detailed',
            'level': logging.DEBUG,
        },
    },
    'loggers': {
        'alembic': {
            'handlers': ['console', 'file'],
            'level': logging.INFO,
            'propagate': False,
        },
        'sqlalchemy': {
            'handlers': ['console', 'file'],
            'level': logging.WARN,
            'propagate': False,
        }
    }
})

logger = logging.getLogger('alembic.env')

# Get alembic configuration
config = context.config

# Map model metadata for autogeneration support
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """
    Execute migrations in 'offline' mode with enhanced validation and error handling.
    
    This function runs migrations without requiring a live database connection,
    useful for generating SQL scripts for manual execution.
    """
    try:
        start_time = time.time()
        logger.info("Starting offline migration")

        # Get database URL from settings with secure parameters
        url = settings.get_database_url()
        
        # Configure context with timeout and SSL settings
        context.configure(
            url=url,
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            compare_type=True,
            compare_server_default=True,
            include_schemas=True,
            version_table='alembic_version',
            version_table_schema=None,
        )

        with context.begin_transaction():
            # Execute migration with performance tracking
            context.run_migrations()

        duration = time.time() - start_time
        logger.info(f"Offline migration completed successfully in {duration:.2f} seconds")

    except Exception as e:
        logger.error(f"Error during offline migration: {str(e)}")
        raise

def run_migrations_online() -> None:
    """
    Execute migrations in 'online' mode with connection pooling and transaction management.
    
    This function runs migrations with an active database connection, implementing
    robust error handling, connection pooling, and performance monitoring.
    """
    start_time = time.time()
    logger.info("Starting online migration")

    # Configure connection pool with optimal settings
    pooling_config = {
        'pool_pre_ping': True,
        'pool_size': 5,
        'max_overflow': 10,
        'pool_timeout': 30,
        'pool_recycle': 1800
    }

    # Create engine with connection pooling
    connectable = create_engine(
        settings.get_database_url(),
        poolclass=pool.QueuePool,
        **pooling_config
    )

    try:
        with connectable.connect() as connection:
            # Configure context with enhanced settings
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=True,
                include_schemas=True,
                version_table='alembic_version',
                version_table_schema=None,
                # Transaction configuration
                transaction_per_migration=True,
                transactional_ddl=True
            )

            # Execute migrations within transaction
            with context.begin_transaction():
                logger.info("Beginning migration transaction")
                context.run_migrations()
                logger.info("Migration transaction completed")

        duration = time.time() - start_time
        logger.info(f"Online migration completed successfully in {duration:.2f} seconds")

    except Exception as e:
        logger.error(f"Error during online migration: {str(e)}")
        # Log detailed error information
        logger.exception("Migration failed with exception:")
        raise

    finally:
        # Ensure connection is properly closed
        connectable.dispose()
        logger.info("Database connections cleaned up")

if context.is_offline_mode():
    logger.info("Running migrations in offline mode")
    run_migrations_offline()
else:
    logger.info("Running migrations in online mode")
    run_migrations_online()