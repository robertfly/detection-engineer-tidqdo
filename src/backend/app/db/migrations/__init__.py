# External imports - versions specified for security tracking
from alembic import context  # alembic v1.12+
from alembic.config import Config  # alembic v1.12+
from alembic.script import ScriptDirectory  # alembic v1.12+
from sqlalchemy import engine_from_config, pool  # sqlalchemy v2.0+
import logging
import logging.config
from pathlib import Path
from typing import Optional

# Internal imports
from ..base import Base  # Import SQLAlchemy declarative base with registered models

# Configure migration-specific logger
MIGRATION_LOGGER = logging.getLogger('alembic.migration')

# Migration configuration constants
SCRIPT_LOCATION = 'migrations'
FILE_TEMPLATE = '%%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s'
SQLALCHEMY_URL_KEY = 'sqlalchemy.url'

def configure_alembic(config: Config) -> None:
    """
    Configures Alembic migration environment with comprehensive safety measures and logging.
    
    Args:
        config: Alembic configuration object
        
    Raises:
        ValueError: If required configuration parameters are missing
        RuntimeError: If migration environment setup fails
    """
    try:
        # Configure logging for migrations
        logging.config.fileConfig(config.config_file_name)
        MIGRATION_LOGGER.info("Configuring Alembic migration environment")
        
        # Set core migration configuration
        config.set_main_option('script_location', SCRIPT_LOCATION)
        config.set_main_option('file_template', FILE_TEMPLATE)
        
        # Configure version locations
        version_locations = [
            f"{SCRIPT_LOCATION}/versions",
            f"{SCRIPT_LOCATION}/dev_versions"
        ]
        config.set_main_option('version_locations', ','.join(version_locations))
        
        # Set up template directory for custom migration templates
        template_path = Path(SCRIPT_LOCATION) / 'templates'
        if template_path.exists():
            config.set_main_option('template_directory', str(template_path))
            
        # Enable Python path for migrations
        config.set_main_option('pythonpath', '.')
        
        MIGRATION_LOGGER.info("Successfully configured Alembic environment")
        
    except Exception as e:
        MIGRATION_LOGGER.error(f"Failed to configure Alembic: {str(e)}")
        raise RuntimeError(f"Migration environment configuration failed: {str(e)}")

def init_migration_environment() -> bool:
    """
    Initializes the complete migration environment with comprehensive error handling.
    
    Returns:
        bool: Success status of initialization
        
    Raises:
        RuntimeError: If migration environment initialization fails
    """
    try:
        MIGRATION_LOGGER.info("Initializing migration environment")
        
        # Get alembic configuration
        config = context.config
        
        # Configure logging and basic settings
        configure_alembic(config)
        
        # Register all models' metadata
        target_metadata = Base.metadata
        
        # Configure database connection with pooling and safety measures
        def run_migrations_online() -> None:
            """Run migrations in 'online' mode with connection pooling."""
            connectable = engine_from_config(
                config.get_section(config.config_ini_section),
                prefix='sqlalchemy.',
                poolclass=pool.NullPool,  # Disable pooling for migrations
                connect_args={
                    'connect_timeout': 60,  # Extended timeout for long migrations
                    'application_name': 'alembic_migration'
                }
            )
            
            with connectable.connect() as connection:
                context.configure(
                    connection=connection,
                    target_metadata=target_metadata,
                    # Enable transaction per migration
                    transaction_per_migration=True,
                    # Compare types for migrations
                    compare_type=True,
                    # Compare server defaults
                    compare_server_default=True,
                    # Include schemas
                    include_schemas=True,
                    # Enable object tracking
                    render_as_batch=True,
                    # Configure migration naming
                    version_table='alembic_version',
                    version_table_schema=None
                )
                
                with context.begin_transaction():
                    context.run_migrations()
        
        # Configure offline migration support
        def run_migrations_offline() -> None:
            """Run migrations in 'offline' mode for SQL generation."""
            url = config.get_main_option(SQLALCHEMY_URL_KEY)
            context.configure(
                url=url,
                target_metadata=target_metadata,
                literal_binds=True,
                dialect_opts={"paramstyle": "named"},
                compare_type=True,
                compare_server_default=True,
                include_schemas=True
            )
            
            with context.begin_transaction():
                context.run_migrations()
        
        # Set up migration execution functions
        if context.is_offline_mode():
            MIGRATION_LOGGER.info("Running migrations in offline mode")
            run_migrations_offline()
        else:
            MIGRATION_LOGGER.info("Running migrations in online mode")
            run_migrations_online()
            
        MIGRATION_LOGGER.info("Successfully initialized migration environment")
        return True
        
    except Exception as e:
        MIGRATION_LOGGER.error(f"Failed to initialize migration environment: {str(e)}")
        raise RuntimeError(f"Migration environment initialization failed: {str(e)}")

# Export required components for migration scripts
__all__ = ['Base', 'configure_alembic', 'init_migration_environment']