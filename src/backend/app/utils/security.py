"""
Enhanced security utility module providing robust authentication, encryption, and security validation
with additional safeguards and monitoring capabilities.

Version: 1.0.0
"""

# External imports with version specifications
import re  # standard library
import secrets  # standard library
import hashlib  # standard library
from argon2 import PasswordHasher  # argon2-cffi v21.3.0
import pyotp  # pyotp v2.8.0
from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # cryptography v41.0.0
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import logging

# Internal imports
from ..core.security import create_access_token, verify_token
from ..core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Argon2 password hasher with enhanced parameters
pwd_hasher = PasswordHasher(
    time_cost=4,          # Increased iterations for enhanced security
    memory_cost=131072,   # 128MB memory usage
    parallelism=8,        # Parallel threads
    hash_len=32,          # Hash length in bytes
    salt_len=32           # Increased salt length
)

def validate_password_strength(password: str, password_history: list[str]) -> tuple[bool, str]:
    """
    Enhanced password validation with entropy calculation and common pattern detection.
    
    Args:
        password: Password to validate
        password_history: List of previously used passwords
        
    Returns:
        tuple[bool, str]: Validation result and detailed message
    """
    if len(password) < 12:
        return False, "Password must be at least 12 characters long"
        
    # Check character requirements
    patterns = {
        'uppercase': r'[A-Z]',
        'lowercase': r'[a-z]',
        'numbers': r'[0-9]',
        'special': r'[!@#$%^&*(),.?":{}|<>]'
    }
    
    missing = [name for name, pattern in patterns.items() 
              if not re.search(pattern, password)]
    
    if missing:
        return False, f"Password must contain {', '.join(missing)}"
    
    # Calculate password entropy
    char_set_size = sum([
        bool(re.search(pattern, password)) * multiplier
        for pattern, multiplier in [
            (r'[A-Z]', 26), (r'[a-z]', 26),
            (r'[0-9]', 10), (r'[^A-Za-z0-9]', 32)
        ]
    ])
    entropy = len(password) * (char_set_size.bit_length())
    
    if entropy < 60:
        return False, "Password is not complex enough"
    
    # Check common patterns
    common_patterns = [
        r'12345', r'qwerty', r'password', r'admin',
        r'([a-zA-Z])\1{2,}', r'(\d)\1{2,}'  # Repeated characters
    ]
    
    if any(re.search(pattern, password.lower()) for pattern in common_patterns):
        return False, "Password contains common patterns"
    
    # Check password history
    if password_history:
        for old_password in password_history:
            try:
                if pwd_hasher.verify(old_password, pwd_hasher.hash(password)):
                    return False, "Password was previously used"
            except Exception:
                continue
    
    return True, "Password meets security requirements"

def generate_secure_token(length: int = 32, url_safe: bool = True) -> str:
    """
    Generate cryptographically secure token with enhanced entropy.
    
    Args:
        length: Desired token length (default: 32)
        url_safe: Generate URL-safe token (default: True)
        
    Returns:
        str: Secure random token string
    """
    if length < 32:
        raise ValueError("Token length must be at least 32 characters")
    
    # Generate initial entropy
    token_bytes = secrets.token_bytes(length)
    
    # Add additional entropy sources
    system_random = secrets.SystemRandom()
    extra_entropy = bytes(system_random.randint(0, 255) for _ in range(32))
    
    # Mix entropy sources
    mixed = bytes(a ^ b for a, b in zip(token_bytes, extra_entropy))
    
    # Generate final token
    if url_safe:
        return secrets.token_urlsafe(len(mixed))
    return secrets.token_hex(len(mixed))

def create_secure_access_token(
    data: dict,
    expires_delta: int,
    security_context: dict
) -> str:
    """
    Create enhanced JWT with additional security claims and monitoring.
    
    Args:
        data: Token payload data
        expires_delta: Token expiration time in minutes
        security_context: Additional security metadata
        
    Returns:
        str: Enhanced JWT token
    """
    try:
        # Add security context claims
        enhanced_data = data.copy()
        enhanced_data.update({
            "device_id": security_context.get("device_id"),
            "client_ip": security_context.get("client_ip"),
            "user_agent": security_context.get("user_agent"),
            "geo_location": security_context.get("geo_location"),
            "security_level": security_context.get("security_level", "standard"),
            "rate_limit_key": hashlib.sha256(
                f"{security_context.get('client_ip')}:{security_context.get('device_id')}"
                .encode()
            ).hexdigest()
        })
        
        # Create token with enhanced data
        token = create_access_token(
            data=enhanced_data,
            expires_delta=expires_delta
        )
        
        # Log security event
        logger.info(
            "Access token created",
            extra={
                "user_id": data.get("sub"),
                "device_id": security_context.get("device_id"),
                "security_level": security_context.get("security_level")
            }
        )
        
        return token
        
    except Exception as e:
        logger.error(f"Token creation failed: {str(e)}")
        raise

def verify_secure_token(token: str, security_context: dict) -> dict:
    """
    Advanced token verification with security checks and monitoring.
    
    Args:
        token: JWT token to verify
        security_context: Current security context for validation
        
    Returns:
        dict: Validated token payload
    """
    try:
        # Verify basic token validity
        payload = verify_token(token, "access")
        
        # Verify security context
        if payload.get("device_id") != security_context.get("device_id"):
            raise ValueError("Device ID mismatch")
            
        if payload.get("security_level") != security_context.get("security_level"):
            raise ValueError("Security level mismatch")
            
        # Verify rate limit key
        expected_key = hashlib.sha256(
            f"{security_context.get('client_ip')}:{security_context.get('device_id')}"
            .encode()
        ).hexdigest()
        
        if payload.get("rate_limit_key") != expected_key:
            raise ValueError("Rate limit key mismatch")
        
        # Log verification event
        logger.info(
            "Token verified successfully",
            extra={
                "user_id": payload.get("sub"),
                "device_id": payload.get("device_id")
            }
        )
        
        return payload
        
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise

def encrypt_sensitive_data(data: str, encryption_context: dict) -> tuple[bytes, bytes]:
    """
    Encrypt sensitive data using AES-256-GCM with additional security context.
    
    Args:
        data: Data to encrypt
        encryption_context: Additional encryption metadata
        
    Returns:
        tuple[bytes, bytes]: Encrypted data and nonce
    """
    try:
        # Generate a random 96-bit nonce
        nonce = secrets.token_bytes(12)
        
        # Generate encryption key using PBKDF2
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=encryption_context.get("salt", secrets.token_bytes(16)),
            iterations=100000,
        )
        key = kdf.derive(settings.SECRET_KEY.get_secret_value().encode())
        
        # Create AESGCM cipher
        aesgcm = AESGCM(key)
        
        # Encrypt data with authentication
        encrypted_data = aesgcm.encrypt(
            nonce,
            data.encode(),
            encryption_context.get("aad", None)
        )
        
        # Log encryption event
        logger.info(
            "Data encrypted successfully",
            extra={
                "context_id": encryption_context.get("context_id"),
                "encryption_type": "AES-256-GCM"
            }
        )
        
        return encrypted_data, nonce
        
    except Exception as e:
        logger.error(f"Encryption failed: {str(e)}")
        raise