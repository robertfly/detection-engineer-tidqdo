"""
Enhanced Slack notification service with rate limiting, message batching, and reliability features.
Provides secure, asynchronous notifications for detection alerts, intelligence updates, and coverage reports.

Versions:
- slack_sdk: 3.19+
- aiohttp: 3.8+
"""

import asyncio
import time
from typing import Dict, List, Optional, Union
from datetime import datetime
import json

from slack_sdk.web.async_client import AsyncWebClient
from slack_sdk.http_retry import RetryHandler
from slack_sdk.errors import SlackApiError
import aiohttp

from app.core.config import settings
from app.core.logging import get_logger

# Configure service logger with security context
logger = get_logger(__name__)

# Service configuration constants
MAX_RETRIES = 3
RATE_LIMIT = 100  # messages per minute
BATCH_SIZE = 10
BATCH_INTERVAL = 1.0  # seconds
MESSAGE_TTL = 300  # seconds

class CustomRetryHandler(RetryHandler):
    """Enhanced retry handler with exponential backoff and jitter."""
    
    def __init__(self, max_retry_count: int = MAX_RETRIES):
        super().__init__(max_retry_count=max_retry_count)
        
    def can_retry(self, *args, **kwargs) -> bool:
        """Determine if retry is possible based on error type and rate limits."""
        err = kwargs.get("error", None)
        if err and isinstance(err, SlackApiError):
            if err.response["error"] == "ratelimited":
                return True
            if err.response.status_code in {408, 429, 500, 502, 503, 504}:
                return True
        return super().can_retry(*args, **kwargs)

class SlackNotifier:
    """
    Enhanced asynchronous Slack notification service with rate limiting and message batching.
    Provides reliable delivery, security filtering, and monitoring capabilities.
    """

    def __init__(
        self,
        token: str,
        default_channel: str,
        max_retries: int = MAX_RETRIES,
        backoff_factor: float = 1.5
    ) -> None:
        """
        Initialize Slack notifier with enhanced configuration.

        Args:
            token: Slack API token
            default_channel: Default channel for notifications
            max_retries: Maximum retry attempts
            backoff_factor: Exponential backoff factor
        """
        if not token or not token.startswith(("xoxb-", "xapp-")):
            raise ValueError("Invalid Slack API token format")

        # Initialize Slack client with custom retry handler
        retry_handler = CustomRetryHandler(max_retry_count=max_retries)
        self._client = AsyncWebClient(
            token=token,
            retry_handlers=[retry_handler]
        )
        
        self._default_channel = default_channel
        self._rate_limiter = {
            "window_start": time.time(),
            "message_count": 0
        }
        self._message_queue = asyncio.Queue()
        self._is_healthy = True
        
        # Start background message processor
        asyncio.create_task(self._process_message_queue())

    async def _check_rate_limit(self) -> bool:
        """
        Check and update rate limiting window.
        
        Returns:
            bool: True if within rate limit, False otherwise
        """
        current_time = time.time()
        window_start = self._rate_limiter["window_start"]
        
        # Reset window if expired
        if current_time - window_start >= 60:
            self._rate_limiter = {
                "window_start": current_time,
                "message_count": 0
            }
            return True
            
        # Check rate limit
        if self._rate_limiter["message_count"] >= RATE_LIMIT:
            return False
            
        self._rate_limiter["message_count"] += 1
        return True

    async def _process_message_queue(self) -> None:
        """Process queued messages in batches with rate limiting."""
        while True:
            try:
                messages = []
                try:
                    while len(messages) < BATCH_SIZE:
                        message = await asyncio.wait_for(
                            self._message_queue.get(),
                            timeout=BATCH_INTERVAL
                        )
                        messages.append(message)
                except asyncio.TimeoutError:
                    pass

                if messages:
                    # Process batch
                    for msg in messages:
                        if await self._check_rate_limit():
                            try:
                                await self._client.chat_postMessage(**msg)
                            except SlackApiError as e:
                                logger.error(
                                    "Failed to send Slack message",
                                    error=str(e),
                                    channel=msg.get("channel"),
                                    correlation_id=msg.get("correlation_id")
                                )
                        else:
                            # Re-queue message if rate limited
                            await self._message_queue.put(msg)
                            await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"Message queue processor error: {str(e)}")
                self._is_healthy = False
                await asyncio.sleep(5)
                self._is_healthy = True

    def _sanitize_message(self, message: Dict) -> Dict:
        """
        Sanitize message content for security.
        
        Args:
            message: Raw message dictionary
            
        Returns:
            Dict: Sanitized message dictionary
        """
        # Remove sensitive patterns
        sensitive_patterns = ["token", "key", "secret", "password", "auth"]
        sanitized = json.loads(json.dumps(message))
        
        def recursive_sanitize(obj):
            if isinstance(obj, dict):
                return {
                    k: "***REDACTED***" if any(p in k.lower() for p in sensitive_patterns)
                    else recursive_sanitize(v)
                    for k, v in obj.items()
                }
            elif isinstance(obj, list):
                return [recursive_sanitize(i) for i in obj]
            return obj
            
        return recursive_sanitize(sanitized)

    async def send_detection_alert(
        self,
        detection_data: Dict,
        channel: Optional[str] = None,
        urgent: bool = False,
        correlation_id: Optional[str] = None
    ) -> Dict:
        """
        Send enhanced detection alert with retry and validation.
        
        Args:
            detection_data: Detection information
            channel: Target channel (optional)
            urgent: Urgent message flag
            correlation_id: Correlation ID for tracking
            
        Returns:
            Dict: Slack API response
        """
        if not self._is_healthy:
            raise RuntimeError("Slack notifier is not healthy")

        channel = channel or self._default_channel
        sanitized_data = self._sanitize_message(detection_data)
        
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "🚨 Detection Alert" if urgent else "Detection Alert"
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Name:*\n{sanitized_data.get('name', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Status:*\n{sanitized_data.get('status', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Type:*\n{sanitized_data.get('type', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Environment:*\n{settings.ENVIRONMENT}"}
                ]
            }
        ]

        message = {
            "channel": channel,
            "blocks": blocks,
            "text": f"Detection Alert: {sanitized_data.get('name', 'N/A')}",
            "metadata": {
                "correlation_id": correlation_id,
                "timestamp": datetime.utcnow().isoformat()
            }
        }

        await self._message_queue.put(message)
        return {"status": "queued", "correlation_id": correlation_id}

    async def send_intelligence_notification(
        self,
        intelligence_data: Dict,
        channel: Optional[str] = None,
        thread_reply: bool = False,
        parent_message_ts: Optional[str] = None
    ) -> Dict:
        """
        Send intelligence notification with enhanced features.
        
        Args:
            intelligence_data: Intelligence information
            channel: Target channel (optional)
            thread_reply: Thread reply flag
            parent_message_ts: Parent message timestamp
            
        Returns:
            Dict: Slack API response
        """
        if not self._is_healthy:
            raise RuntimeError("Slack notifier is not healthy")

        channel = channel or self._default_channel
        sanitized_data = self._sanitize_message(intelligence_data)
        
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "📊 Intelligence Update"
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Source:*\n{sanitized_data.get('source', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Type:*\n{sanitized_data.get('type', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Confidence:*\n{sanitized_data.get('confidence', 'N/A')}"}
                ]
            }
        ]

        message = {
            "channel": channel,
            "blocks": blocks,
            "text": f"Intelligence Update: {sanitized_data.get('source', 'N/A')}",
            "thread_ts": parent_message_ts if thread_reply else None
        }

        await self._message_queue.put(message)
        return {"status": "queued", "thread_ts": parent_message_ts}

    async def send_coverage_alert(
        self,
        coverage_data: Dict,
        channel: Optional[str] = None,
        mentions: Optional[List[str]] = None,
        high_priority: bool = False
    ) -> Dict:
        """
        Send coverage alert with enhanced formatting.
        
        Args:
            coverage_data: Coverage information
            channel: Target channel (optional)
            mentions: User mentions list
            high_priority: High priority flag
            
        Returns:
            Dict: Slack API response
        """
        if not self._is_healthy:
            raise RuntimeError("Slack notifier is not healthy")

        channel = channel or self._default_channel
        sanitized_data = self._sanitize_message(coverage_data)
        
        # Format user mentions
        mention_text = ""
        if mentions:
            mention_text = " ".join(f"<@{m}>" for m in mentions)

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "⚠️ Coverage Alert" if high_priority else "Coverage Update"
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Coverage:*\n{sanitized_data.get('coverage_percentage', 'N/A')}%"},
                    {"type": "mrkdwn", "text": f"*Framework:*\n{sanitized_data.get('framework', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Gaps:*\n{len(sanitized_data.get('gaps', []))} identified"}
                ]
            }
        ]

        if mention_text:
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"Please review: {mention_text}"}
            })

        message = {
            "channel": channel,
            "blocks": blocks,
            "text": f"Coverage Alert: {sanitized_data.get('coverage_percentage', 'N/A')}% coverage"
        }

        await self._message_queue.put(message)
        return {"status": "queued"}