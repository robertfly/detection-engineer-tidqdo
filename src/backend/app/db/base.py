# External imports - versions specified for security tracking
from sqlalchemy.orm import declarative_base  # sqlalchemy v2.0+

# Internal imports
from .session import Base
from ..models.user import User  # Import User model for registration
from ..models.detection import Detection  # Import Detection model for registration

# Re-export Base for use in other modules
# This allows other modules to import Base from this central location
__all__ = ["Base"]

# The models are imported but not used directly in this file.
# This import is necessary to ensure the models are registered with SQLAlchemy's
# declarative base system before any database operations occur.
# The registration happens through the Base class's metaclass when the models are imported.

# The following models are registered with SQLAlchemy:
# - User: Core user management and authentication
# - Detection: Security detection rules and their metadata

# Note: When adding new models to the application, they should be imported here
# to ensure proper registration with SQLAlchemy's declarative base system.