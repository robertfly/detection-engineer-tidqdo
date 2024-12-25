"""
SQLAlchemy models package initialization for the AI-Driven Detection Engineering platform.
Provides centralized model imports and type-safe exports with version tracking.

Version: 1.0.0
"""

# External imports - versions specified for security tracking
from typing import TYPE_CHECKING  # typing v3.11+

# Internal model imports with explicit type checking
from .user import User  # User model for authentication and profile management
from .detection import Detection  # Detection model for security rules
from .organization import Organization  # Organization model for team management

# Version tracking for the models package
__version__ = '1.0.0'

# Define explicit exports with type safety
# This ensures only intended models are exposed and provides IDE support
__all__ = [
    'User',  # Core user management model
    'Detection',  # Security detection rules model
    'Organization',  # Enterprise organization model
]

# Type checking block for enhanced type safety
# This ensures proper type hints without runtime overhead
if TYPE_CHECKING:
    from .user import User
    from .detection import Detection
    from .organization import Organization