"""
Test module initialization for WebSocket functionality testing.
Provides comprehensive test fixtures, utilities, and configuration for WebSocket testing.

Versions:
- pytest: 7.0+
- mock: 3.11+
- asyncio: 3.11+
- fakeredis: 2.0+
- aioredis: 2.0+
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
import json
import time
from typing import Dict, Optional, List
import fakeredis.aioredis
import aioredis

from app.websockets.connection import WebSocketConnection
from app.websockets.manager import WebSocketManager
from app.websockets.events import EVENT_TYPES, EVENT_ACTIONS

# Test configuration constants
TEST_CONFIG = {
    "REDIS_URL": "redis://localhost:6379",
    "REDIS_CHANNEL": "test_websocket_events",
    "MAX_CONNECTIONS": 1000,
    "MESSAGE_TIMEOUT": 5.0,
    "HEARTBEAT_INTERVAL": 30.0,
    "RECONNECT_DELAY": 1.0,
    "MAX_MESSAGE_SIZE": 1048576,  # 1MB
    "CLEANUP_INTERVAL": 60.0
}

class MockWebSocket:
    """Enhanced mock WebSocket class for comprehensive testing."""

    def __init__(self):
        """Initialize enhanced mock WebSocket with state tracking."""
        self.sent_messages: List[Dict] = []
        self.received_messages: List[Dict] = []
        self.is_connected: bool = False
        self.last_heartbeat: float = time.time()
        self.connection_stats: Dict = {
            "messages_sent": 0,
            "messages_received": 0,
            "bytes_sent": 0,
            "bytes_received": 0,
            "connected_at": None,
            "last_activity": None
        }

    async def send_message(self, message: Dict, validate: bool = True) -> bool:
        """
        Mock message sending with validation and statistics tracking.

        Args:
            message: Dictionary containing the message to send
            validate: Whether to validate message format

        Returns:
            bool: Success status
        """
        try:
            if validate and not self._validate_message(message):
                raise ValueError("Invalid message format")

            self.sent_messages.append(message)
            self.connection_stats["messages_sent"] += 1
            self.connection_stats["bytes_sent"] += len(json.dumps(message))
            self.connection_stats["last_activity"] = time.time()
            return True

        except Exception as e:
            print(f"Send message error: {str(e)}")
            return False

    async def receive_message(self, timeout: float = 5.0) -> Optional[Dict]:
        """
        Mock message receiving with timeout and statistics tracking.

        Args:
            timeout: Maximum time to wait for message

        Returns:
            Optional[Dict]: Received message or None on timeout
        """
        try:
            if not self.is_connected:
                raise ConnectionError("WebSocket not connected")

            if self.received_messages:
                message = self.received_messages.pop(0)
                self.connection_stats["messages_received"] += 1
                self.connection_stats["bytes_received"] += len(json.dumps(message))
                self.connection_stats["last_activity"] = time.time()
                return message

            await asyncio.sleep(min(timeout, 0.1))
            return None

        except Exception as e:
            print(f"Receive message error: {str(e)}")
            return None

    def _validate_message(self, message: Dict) -> bool:
        """
        Validate message format and content.

        Args:
            message: Message to validate

        Returns:
            bool: Validation status
        """
        try:
            required_fields = {"type", "payload"}
            if not all(field in message for field in required_fields):
                return False

            if message["type"] not in EVENT_TYPES.values():
                return False

            if "action" in message and message["action"] not in EVENT_ACTIONS.values():
                return False

            return True

        except Exception:
            return False

@pytest.fixture
async def mock_websocket():
    """
    Fixture providing mock WebSocket instance with message tracking and state management.

    Returns:
        MockWebSocket: Configured mock WebSocket instance
    """
    websocket = MockWebSocket()
    websocket.is_connected = True
    websocket.connection_stats["connected_at"] = time.time()
    websocket.connection_stats["last_activity"] = time.time()
    yield websocket
    websocket.is_connected = False

@pytest.fixture
async def mock_redis():
    """
    Fixture providing fake Redis instance with pub/sub support.

    Returns:
        FakeRedis: Configured fake Redis instance
    """
    redis = await fakeredis.aioredis.create_redis_pool()
    yield redis
    redis.close()
    await redis.wait_closed()

@pytest.fixture
async def event_handler(mock_redis):
    """
    Fixture providing WebSocket event handler instance with enhanced event validation.

    Args:
        mock_redis: Redis fixture instance

    Returns:
        WebSocketEventHandler: Configured event handler instance
    """
    from app.websockets.events import WebSocketEventHandler
    
    # Patch Redis client in event handler
    with patch('app.websockets.events.Redis') as mock_redis_class:
        mock_redis_class.from_url.return_value = mock_redis
        handler = WebSocketEventHandler()
        yield handler
        # Cleanup
        for client_id in list(handler._connections.keys()):
            await handler.remove_connection(client_id)

@pytest.fixture
def sample_events():
    """
    Fixture providing sample WebSocket events for testing.

    Returns:
        Dict: Sample events by type
    """
    return {
        "detection": {
            "type": EVENT_TYPES["DETECTION"],
            "action": EVENT_ACTIONS["CREATED"],
            "payload": {
                "detection_id": "test-123",
                "name": "Test Detection",
                "status": "active"
            }
        },
        "intelligence": {
            "type": EVENT_TYPES["INTELLIGENCE"],
            "action": EVENT_ACTIONS["PROCESSED"],
            "payload": {
                "intel_id": "intel-123",
                "source": "test-source",
                "status": "complete"
            }
        },
        "coverage": {
            "type": EVENT_TYPES["COVERAGE"],
            "action": EVENT_ACTIONS["UPDATED"],
            "payload": {
                "coverage_id": "cov-123",
                "percentage": 85,
                "gaps": []
            }
        }
    }

# Export enhanced mock WebSocket class and test configuration
__all__ = ['MockWebSocket', 'TEST_CONFIG']