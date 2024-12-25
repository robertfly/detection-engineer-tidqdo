"""
Enterprise-grade email service module providing secure, scalable email notification capabilities
with template management, rate limiting, and comprehensive monitoring.

Versions:
- fastapi-mail: 1.4.1
- jinja2: 3.1.2
- aioredis: 2.0.1
- bleach: 6.0.0
"""

# External imports with version tracking
from fastapi_mail import FastMail, ConnectionConfig, MessageSchema  # v1.4.1
from jinja2 import Environment, FileSystemLoader, select_autoescape  # v3.1.2
import aioredis  # v2.0.1
import bleach  # v6.0.0
import asyncio
from pathlib import Path
from typing import Dict, Optional, Union
from datetime import datetime, timedelta
import uuid
import json

# Internal imports
from ...core.config import settings, PROJECT_NAME, EMAIL_SETTINGS
from ...models.user import User
from ...core.logging import logger

class EmailService:
    """
    Comprehensive service class for handling email operations with security,
    rate limiting, and monitoring capabilities.
    """

    def __init__(self, config: ConnectionConfig, template_settings: Dict):
        """Initialize email service with secure configuration and monitoring."""
        self._mail_client = FastMail(config)
        
        # Initialize template environment with security features
        self._template_env = Environment(
            loader=FileSystemLoader(template_settings['template_dir']),
            autoescape=select_autoescape(['html', 'xml']),
            trim_blocks=True,
            lstrip_blocks=True,
            cache_size=100
        )
        
        # Initialize Redis for rate limiting
        self._rate_limiter = aioredis.from_url(
            settings.get_redis_url(),
            encoding="utf-8",
            decode_responses=True
        )
        
        # Template cache for performance
        self._template_cache = {}
        
        # Metrics collection
        self._metrics = {
            'sent_count': 0,
            'error_count': 0,
            'rate_limited_count': 0
        }

    async def send_verification_email(self, user: User, verification_token: str) -> None:
        """
        Send secure email verification link to user with rate limiting and monitoring.
        
        Args:
            user: User model instance
            verification_token: Secure verification token
        """
        try:
            # Check rate limit
            rate_key = f"email_rate:verification:{user.email}"
            if await self._check_rate_limit(rate_key, max_attempts=3, window_seconds=3600):
                logger.warning(f"Rate limit exceeded for verification email: {user.email}")
                self._metrics['rate_limited_count'] += 1
                return

            # Load and validate template
            template = self._get_template('verification.html')
            
            # Prepare secure context with sanitization
            context = {
                'project_name': PROJECT_NAME,
                'username': bleach.clean(user.name or user.email),
                'verification_url': self._build_verification_url(verification_token)
            }
            
            # Render template with security measures
            html_content = template.render(**context)
            
            # Create message with security headers
            message = MessageSchema(
                subject=f"{PROJECT_NAME} - Verify Your Email",
                recipients=[user.email],
                body=html_content,
                subtype="html",
                headers={
                    'X-Message-ID': str(uuid.uuid4()),
                    'X-Priority': '1',
                    'X-Mailer': PROJECT_NAME,
                }
            )

            # Send email with monitoring
            await self._send_with_monitoring(message, 'verification')
            
            logger.info(f"Verification email sent successfully to {user.email}")
            
        except Exception as e:
            logger.error(f"Failed to send verification email: {str(e)}")
            self._metrics['error_count'] += 1
            raise

    async def send_alert_notification(
        self,
        user: User,
        alert_type: str,
        alert_data: Dict,
        high_priority: bool = False
    ) -> None:
        """
        Send alert notification with priority handling and rate limiting.
        
        Args:
            user: User model instance
            alert_type: Type of alert
            alert_data: Alert details
            high_priority: Priority flag for rate limiting
        """
        try:
            # Check user notification preferences
            if not self._check_notification_preferences(user, alert_type):
                logger.info(f"Alert notification skipped due to user preferences: {user.email}")
                return

            # Apply rate limiting based on priority
            rate_key = f"email_rate:alert:{user.email}:{alert_type}"
            window = 300 if high_priority else 3600  # 5 min for high priority, 1 hour for normal
            if await self._check_rate_limit(rate_key, max_attempts=5, window_seconds=window):
                logger.warning(f"Rate limit exceeded for alert email: {user.email}")
                self._metrics['rate_limited_count'] += 1
                return

            # Load and sanitize alert template
            template = self._get_template('alert.html')
            
            # Sanitize alert data
            sanitized_data = self._sanitize_alert_data(alert_data)
            
            # Prepare secure context
            context = {
                'project_name': PROJECT_NAME,
                'username': bleach.clean(user.name or user.email),
                'alert_type': bleach.clean(alert_type),
                'alert_data': sanitized_data,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            # Render template
            html_content = template.render(**context)
            
            # Create message with priority headers
            message = MessageSchema(
                subject=f"{PROJECT_NAME} - {alert_type.upper()} Alert",
                recipients=[user.email],
                body=html_content,
                subtype="html",
                headers={
                    'X-Message-ID': str(uuid.uuid4()),
                    'X-Priority': '1' if high_priority else '3',
                    'X-Alert-Type': alert_type,
                    'X-Mailer': PROJECT_NAME
                }
            )

            # Send with priority queue handling
            await self._send_with_monitoring(message, 'alert', high_priority)
            
            logger.info(f"Alert notification sent successfully to {user.email}")
            
        except Exception as e:
            logger.error(f"Failed to send alert notification: {str(e)}")
            self._metrics['error_count'] += 1
            raise

    async def _check_rate_limit(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        """Check if rate limit is exceeded for given key."""
        try:
            current = await self._rate_limiter.incr(key)
            if current == 1:
                await self._rate_limiter.expire(key, window_seconds)
            return current > max_attempts
        except Exception as e:
            logger.error(f"Rate limiting error: {str(e)}")
            return False

    def _get_template(self, template_name: str) -> Environment:
        """Get template with caching and validation."""
        if template_name not in self._template_cache:
            template = self._template_env.get_template(template_name)
            self._template_cache[template_name] = template
        return self._template_cache[template_name]

    def _sanitize_alert_data(self, alert_data: Dict) -> Dict:
        """Sanitize alert data to prevent XSS."""
        return {
            k: bleach.clean(str(v)) if isinstance(v, str) else v
            for k, v in alert_data.items()
        }

    def _check_notification_preferences(self, user: User, alert_type: str) -> bool:
        """Check if user has enabled notifications for alert type."""
        preferences = user.preferences.get('notifications', {})
        return preferences.get(alert_type, True)

    def _build_verification_url(self, token: str) -> str:
        """Build secure verification URL."""
        base_url = settings.EMAIL_SETTINGS['verification_base_url']
        return f"{base_url}/verify?token={token}"

    async def _send_with_monitoring(
        self,
        message: MessageSchema,
        email_type: str,
        high_priority: bool = False
    ) -> None:
        """Send email with monitoring and retry logic."""
        max_retries = 3 if high_priority else 1
        retry_delay = 1  # seconds
        
        for attempt in range(max_retries):
            try:
                await self._mail_client.send_message(message)
                self._metrics['sent_count'] += 1
                return
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                logger.warning(f"Email send attempt {attempt + 1} failed: {str(e)}")
                await asyncio.sleep(retry_delay)

def create_email_config() -> ConnectionConfig:
    """Create secure FastMail configuration with monitoring."""
    return ConnectionConfig(
        MAIL_USERNAME=settings.EMAIL_SETTINGS['username'],
        MAIL_PASSWORD=settings.EMAIL_SETTINGS['password'],
        MAIL_FROM=settings.EMAIL_SETTINGS['from_email'],
        MAIL_PORT=settings.EMAIL_SETTINGS['port'],
        MAIL_SERVER=settings.EMAIL_SETTINGS['server'],
        MAIL_FROM_NAME=PROJECT_NAME,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=True,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
        TEMPLATE_FOLDER=Path(settings.EMAIL_SETTINGS['template_dir'])
    )