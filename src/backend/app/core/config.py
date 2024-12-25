# External imports - versions specified for security tracking
from pydantic import BaseSettings, SecretStr  # pydantic v2.0+
from dotenv import load_dotenv  # python-dotenv v1.0+
from os import getenv
from typing import List, Optional
import ssl
import logging
from pathlib import Path

# Global constants
PROJECT_NAME = "AI-Driven Detection Engineering Platform"
API_V1_PREFIX = "/api/v1"
DEFAULT_ENVIRONMENT = "development"

class Settings(BaseSettings):
    """
    Comprehensive application settings management using Pydantic BaseSettings
    with enhanced security features and validation.
    
    Implements secure configuration handling for the AI-Driven Detection Platform
    with support for environment-specific settings and encrypted sensitive data.
    """
    
    # Core Application Settings
    PROJECT_NAME: str = PROJECT_NAME
    ENVIRONMENT: str = getenv("ENVIRONMENT", DEFAULT_ENVIRONMENT)
    API_V1_PREFIX: str = API_V1_PREFIX
    
    # Security Settings
    SECRET_KEY: SecretStr = SecretStr(getenv("SECRET_KEY", ""))
    ALGORITHM: str = "RS256"  # JWT signing algorithm
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    BACKEND_CORS_ORIGINS: List[str] = getenv("BACKEND_CORS_ORIGINS", "").split(",")
    
    # Logging Configuration
    LOG_LEVEL: str = getenv("LOG_LEVEL", "INFO")
    
    # PostgreSQL Database Settings
    POSTGRES_SERVER: str = getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_PORT: int = int(getenv("POSTGRES_PORT", "5432"))
    POSTGRES_DB: str = getenv("POSTGRES_DB", "detection_platform")
    POSTGRES_PASSWORD: SecretStr = SecretStr(getenv("POSTGRES_PASSWORD", ""))
    POSTGRES_USER: str = getenv("POSTGRES_USER", "postgres")
    
    # Redis Cache Settings
    REDIS_HOST: str = getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(getenv("REDIS_PORT", "6379"))
    REDIS_PASSWORD: SecretStr = SecretStr(getenv("REDIS_PASSWORD", ""))
    
    # MongoDB Settings
    MONGODB_URL: str = getenv("MONGODB_URL", "mongodb://localhost:27017/detection_platform")
    
    # Elasticsearch Settings
    ELASTICSEARCH_HOST: str = getenv("ELASTICSEARCH_HOST", "localhost")
    ELASTICSEARCH_PORT: int = int(getenv("ELASTICSEARCH_PORT", "9200"))
    ELASTICSEARCH_PASSWORD: SecretStr = SecretStr(getenv("ELASTICSEARCH_PASSWORD", ""))
    
    # Performance and Security Limits
    API_RATE_LIMIT: int = int(getenv("API_RATE_LIMIT", "1000"))  # requests per minute
    MAX_CONNECTIONS: int = int(getenv("MAX_CONNECTIONS", "100"))
    
    # SSL/TLS Configuration
    SSL_CERT_PATH: str = getenv("SSL_CERT_PATH", "")
    SSL_KEY_PATH: str = getenv("SSL_KEY_PATH", "")

    class Config:
        """Pydantic configuration for enhanced security"""
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = "utf-8"
        validate_assignment = True
        
    def __init__(self, **kwargs):
        """Initialize settings with secure environment variable loading and validation"""
        # Load environment variables securely
        try:
            load_dotenv(override=True)
        except Exception as e:
            logging.error(f"Failed to load environment variables: {e}")
            raise
            
        super().__init__(**kwargs)
        
        # Initialize logging configuration
        logging.basicConfig(
            level=getattr(logging, self.LOG_LEVEL),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # Validate security settings on initialization
        self.validate_security_settings()

    def get_database_url(self) -> str:
        """
        Construct secure PostgreSQL database URL with connection pooling parameters
        
        Returns:
            str: Secure PostgreSQL connection URL with optimized parameters
        """
        # Validate required database parameters
        if not self.POSTGRES_PASSWORD.get_secret_value():
            raise ValueError("Database password must be set")
            
        # Construct base URL with security options
        url = (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD.get_secret_value()}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
        
        # Add connection pooling and SSL parameters
        params = [
            "sslmode=verify-full" if self.SSL_CERT_PATH else "sslmode=prefer",
            "pool_size=20",
            "max_overflow=10",
            "pool_timeout=30",
            "pool_recycle=1800"
        ]
        
        return f"{url}?{'&'.join(params)}"

    def get_redis_url(self) -> str:
        """
        Construct secure Redis connection URL with TLS support
        
        Returns:
            str: Secure Redis connection URL with TLS configuration
        """
        # Construct base URL
        url = f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"
        
        # Add password if configured
        if self.REDIS_PASSWORD.get_secret_value():
            url = (
                f"redis://:{self.REDIS_PASSWORD.get_secret_value()}"
                f"@{self.REDIS_HOST}:{self.REDIS_PORT}/0"
            )
            
        # Add TLS parameters if SSL is configured
        if self.SSL_CERT_PATH:
            url += "?ssl=true&ssl_cert_reqs=required"
            
        return url

    def validate_security_settings(self) -> bool:
        """
        Validate security-critical configuration parameters
        
        Returns:
            bool: Validation success status
        """
        # Validate secret key
        if not self.SECRET_KEY.get_secret_value():
            raise ValueError("SECRET_KEY must be set")
            
        # Validate JWT configuration
        if self.ACCESS_TOKEN_EXPIRE_MINUTES < 5:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be at least 5 minutes")
            
        if self.REFRESH_TOKEN_EXPIRE_DAYS < 1:
            raise ValueError("REFRESH_TOKEN_EXPIRE_DAYS must be at least 1 day")
            
        # Validate SSL configuration if enabled
        if self.SSL_CERT_PATH:
            cert_path = Path(self.SSL_CERT_PATH)
            key_path = Path(self.SSL_KEY_PATH)
            if not (cert_path.exists() and key_path.exists()):
                raise ValueError("SSL certificate and key files must exist")
                
        # Validate CORS origins
        if self.BACKEND_CORS_ORIGINS:
            for origin in self.BACKEND_CORS_ORIGINS:
                if not origin.startswith(("http://", "https://")):
                    raise ValueError(f"Invalid CORS origin: {origin}")
                    
        return True

# Create global settings instance
settings = Settings()