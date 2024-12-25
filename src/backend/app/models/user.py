# External imports - versions specified for security tracking
from sqlalchemy import Column, String, Boolean, DateTime, Index, Integer  # sqlalchemy v2.0+
from sqlalchemy.dialects.postgresql import UUID, JSONB  # sqlalchemy v2.0+
from sqlalchemy.orm import validates  # sqlalchemy v2.0+
from sqlalchemy_utils import EncryptedType  # sqlalchemy-utils v0.41.0+
from argon2 import PasswordHasher  # argon2-cffi v21.3.0+
from datetime import datetime, timedelta
import uuid
import re
import logging
from typing import Optional, List, Dict

# Internal imports
from ..db.session import Base

# Configure logging
logger = logging.getLogger(__name__)

# Initialize password hasher with secure defaults
ph = PasswordHasher(
    time_cost=3,  # Higher time cost for enhanced security
    memory_cost=65536,  # 64MB memory cost
    parallelism=4,  # Parallel threads for hashing
    hash_len=32,  # Output hash length
    salt_len=16  # Salt length
)

# Global constants
ROLES = ['public', 'community', 'enterprise', 'admin']
PASSWORD_HISTORY_SIZE = 5
MAX_LOGIN_ATTEMPTS = 3
LOCKOUT_DURATION = timedelta(minutes=15)

# Password complexity requirements
PASSWORD_MIN_LENGTH = 12
PASSWORD_PATTERN = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$'
)

class User(Base):
    """
    SQLAlchemy model representing a user with enhanced security features and GDPR compliance.
    Implements secure password handling, role-based access control, and data protection.
    """
    __tablename__ = 'users'

    # Primary key and identification
    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    
    # Encrypted personal information
    email = Column(EncryptedType(String(254)), unique=True, nullable=False)
    name = Column(String(100), nullable=True)
    
    # Authentication fields
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default='public')
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    
    # Security tracking
    failed_login_attempts = Column(Integer, default=0)
    lockout_until = Column(DateTime, nullable=True)
    password_history = Column(JSONB, default=list)
    
    # User preferences and settings
    preferences = Column(JSONB, default=dict)
    
    # Audit timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # GDPR compliance
    gdpr_consent = Column(Boolean, default=False)
    gdpr_consent_date = Column(DateTime, nullable=True)

    def __init__(self, **kwargs):
        """Initialize user model with secure defaults and GDPR tracking."""
        super().__init__(**kwargs)
        self.id = uuid.uuid4()
        self.is_active = True
        self.is_superuser = False
        self.created_at = datetime.utcnow()
        self.password_history = []
        self.preferences = {}
        self.failed_login_attempts = 0
        self.lockout_until = None

    @validates('email')
    def validate_email(self, key: str, email: str) -> str:
        """Validate email format and domain."""
        if not email or '@' not in email:
            raise ValueError("Invalid email format")
        if len(email) > 254:  # RFC 5321
            raise ValueError("Email exceeds maximum length")
        return email.lower()

    @validates('role')
    def validate_role(self, key: str, role: str) -> str:
        """Validate user role against allowed roles."""
        if role not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
        return role

    def verify_password(self, plain_password: str) -> bool:
        """
        Securely verify password with brute force protection.
        
        Args:
            plain_password: The password to verify
            
        Returns:
            bool: True if password matches and account not locked
        """
        # Check for account lockout
        if self.lockout_until and datetime.utcnow() < self.lockout_until:
            logger.warning(f"Login attempt for locked account: {self.email}")
            return False

        try:
            # Verify password using Argon2
            ph.verify(self.hashed_password, plain_password)
            
            # Reset failed attempts on success
            self.failed_login_attempts = 0
            self.lockout_until = None
            return True
            
        except Exception as e:
            # Increment failed attempts
            self.failed_login_attempts += 1
            
            # Implement lockout if threshold reached
            if self.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
                self.lockout_until = datetime.utcnow() + LOCKOUT_DURATION
                logger.warning(f"Account locked due to failed attempts: {self.email}")
                
            return False

    def update_last_login(self) -> None:
        """Update login timestamp and audit log."""
        self.last_login = datetime.utcnow()
        self.failed_login_attempts = 0
        self.lockout_until = None
        logger.info(f"Successful login recorded for user: {self.email}")

    def set_password(self, plain_password: str) -> None:
        """
        Securely hash and store password with history tracking.
        
        Args:
            plain_password: The new password to hash and store
            
        Raises:
            ValueError: If password doesn't meet complexity requirements or is in history
        """
        # Validate password complexity
        if not PASSWORD_PATTERN.match(plain_password):
            raise ValueError(
                "Password must be at least 12 characters long and contain uppercase, "
                "lowercase, number and special character"
            )

        # Check password history
        if self.password_history:
            for old_hash in self.password_history:
                try:
                    ph.verify(old_hash, plain_password)
                    raise ValueError(
                        f"Password was used in the last {PASSWORD_HISTORY_SIZE} passwords"
                    )
                except Exception:
                    continue

        # Generate new password hash
        new_hash = ph.hash(plain_password)
        
        # Update password history
        self.password_history = (
            [new_hash] + self.password_history[:PASSWORD_HISTORY_SIZE-1]
        )
        
        # Set new password
        self.hashed_password = new_hash
        logger.info(f"Password updated for user: {self.email}")

    def __repr__(self) -> str:
        """Secure string representation without sensitive data."""
        return f"<User {self.email}>"

# Create indexes for performance
Index('ix_users_email', User.email, unique=True)
Index('ix_users_role', User.role)