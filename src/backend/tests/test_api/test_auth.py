# External imports - versions specified for security tracking
import pytest  # pytest v7.0+
import pytest_asyncio  # pytest-asyncio v0.21+
from jose import jwt  # python-jose v3.3+
from fastapi import status  # fastapi v0.104+
from datetime import datetime, timedelta
import logging
from typing import Dict, Any

# Internal imports
from ...app.schemas.auth import Token, TokenPayload, UserLogin, UserRegister
from ...app.core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

class TestAuthSecurity:
    """Test suite for authentication security features with comprehensive validation."""

    def setup_method(self):
        """Setup method for each test with security configurations."""
        self.test_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Request-ID": "test-request"
        }
        
        # Security test configurations
        self.rate_limit_window = 60  # seconds
        self.max_login_attempts = 3
        self.password_complexity = {
            "min_length": 12,
            "require_upper": True,
            "require_lower": True,
            "require_digit": True,
            "require_special": True
        }

    @pytest.mark.asyncio
    async def test_login_success(self, test_client, test_user):
        """Test successful user login with comprehensive security validations."""
        # Prepare login credentials
        login_data = UserLogin(
            email=test_user.email,
            password="SecureP@ssw0rd123",
            remember_me=False
        )

        # Execute login request
        response = await test_client.post(
            f"{settings.API_V1_PREFIX}/auth/login",
            json=login_data.dict(),
            headers=self.test_headers
        )

        # Validate response status
        assert response.status_code == status.HTTP_200_OK
        
        # Parse and validate token response
        token_data = Token(**response.json())
        
        # Verify access token
        access_payload = jwt.decode(
            token_data.access_token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM]
        )
        assert access_payload["sub"] == str(test_user.id)
        assert access_payload["role"] == test_user.role
        
        # Verify refresh token
        refresh_payload = jwt.decode(
            token_data.refresh_token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM]
        )
        assert refresh_payload["sub"] == str(test_user.id)
        
        # Validate token expiration times
        assert token_data.access_token_expires > datetime.utcnow()
        assert token_data.refresh_token_expires > datetime.utcnow()
        
        # Verify security headers
        assert "X-Content-Type-Options" in response.headers
        assert "X-Frame-Options" in response.headers
        assert "X-XSS-Protection" in response.headers

    @pytest.mark.asyncio
    async def test_login_rate_limit(self, test_client):
        """Test rate limiting on login endpoint with security monitoring."""
        login_data = {
            "email": "test@example.com",
            "password": "TestP@ssw0rd123"
        }

        # Send multiple rapid requests
        responses = []
        for _ in range(settings.API_RATE_LIMIT + 1):
            response = await test_client.post(
                f"{settings.API_V1_PREFIX}/auth/login",
                json=login_data,
                headers=self.test_headers
            )
            responses.append(response)

        # Verify rate limit enforcement
        assert responses[-1].status_code == status.HTTP_429_TOO_MANY_REQUESTS
        
        # Validate rate limit headers
        assert "X-RateLimit-Limit" in responses[-1].headers
        assert "X-RateLimit-Remaining" in responses[-1].headers
        assert "X-RateLimit-Reset" in responses[-1].headers

    @pytest.mark.asyncio
    async def test_register_security(self, test_client, get_test_db):
        """Test registration endpoint with comprehensive security validations."""
        # Test registration data with strong password
        register_data = UserRegister(
            email="newuser@example.com",
            name="Test User",
            password="SecureP@ssw0rd123!",
            role="community",
            gdpr_consent=True,
            terms_accepted=True
        )

        # Execute registration request
        response = await test_client.post(
            f"{settings.API_V1_PREFIX}/auth/register",
            json=register_data.dict(),
            headers=self.test_headers
        )

        # Validate response
        assert response.status_code == status.HTTP_201_CREATED
        
        # Verify password complexity
        with pytest.raises(ValueError):
            UserRegister(
                email="weak@example.com",
                name="Weak User",
                password="weak",
                role="public",
                gdpr_consent=True,
                terms_accepted=True
            )

        # Verify GDPR consent requirement
        with pytest.raises(ValueError):
            UserRegister(
                email="nogdpr@example.com",
                name="No GDPR",
                password="SecureP@ssw0rd123!",
                role="public",
                gdpr_consent=False,
                terms_accepted=True
            )

    @pytest.mark.asyncio
    async def test_token_security(self, test_client, test_user):
        """Test JWT token security features and rotation."""
        # Login to obtain initial tokens
        login_response = await test_client.post(
            f"{settings.API_V1_PREFIX}/auth/login",
            json={"email": test_user.email, "password": "SecureP@ssw0rd123"},
            headers=self.test_headers
        )
        
        tokens = Token(**login_response.json())
        
        # Test token refresh
        refresh_response = await test_client.post(
            f"{settings.API_V1_PREFIX}/auth/refresh",
            headers={
                **self.test_headers,
                "Authorization": f"Bearer {tokens.refresh_token}"
            }
        )
        
        # Validate new tokens
        new_tokens = Token(**refresh_response.json())
        assert new_tokens.access_token != tokens.access_token
        assert new_tokens.refresh_token != tokens.refresh_token
        
        # Verify token revocation
        revoke_response = await test_client.post(
            f"{settings.API_V1_PREFIX}/auth/revoke",
            headers={
                **self.test_headers,
                "Authorization": f"Bearer {tokens.access_token}"
            }
        )
        assert revoke_response.status_code == status.HTTP_200_OK
        
        # Verify revoked token is rejected
        invalid_response = await test_client.get(
            f"{settings.API_V1_PREFIX}/auth/verify",
            headers={
                **self.test_headers,
                "Authorization": f"Bearer {tokens.access_token}"
            }
        )
        assert invalid_response.status_code == status.HTTP_401_UNAUTHORIZED