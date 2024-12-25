"""
Comprehensive test suite for WebSocket event handling system.
Tests event broadcasting, subscription management, real-time notifications,
monitoring, security, and performance aspects.

Versions:
- pytest: 7.0+
- pytest-asyncio: 0.20+
- asyncio: 3.11+
- fakeredis: 2.0+
"""

import pytest
import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import Mock, patch
import fakeredis.aioredis

from ...app.websockets.events import (
    WebSocketEventHandler,
    EVENT_TYPES,
    EVENT_ACTIONS,
    validate_event
)
from ...app.websockets.connection import WebSocketConnection

class MockWebSocketConnection:
    """Enhanced mock WebSocket connection for testing event handling and monitoring."""
    
    def __init__(self, client_id: str, is_healthy: bool = True):
        """Initialize mock connection with test client ID and monitoring."""
        self.client_id = client_id
        self.received_messages = []
        self.is_active = is_healthy
        self.metrics = {
            "messages_sent": 0,
            "messages_failed": 0,
            "last_activity": datetime.now(timezone.utc).isoformat()
        }
        self.is_healthy = is_healthy

    async def send_message(self, message: dict) -> bool:
        """Mock message sending with metrics collection."""
        if not self.is_active:
            return False
            
        self.received_messages.append(message)
        self.metrics["messages_sent"] += 1
        self.metrics["last_activity"] = datetime.now(timezone.utc).isoformat()
        return True

    async def get_health(self) -> dict:
        """Mock health check implementation."""
        return {
            "is_healthy": self.is_healthy,
            "metrics": self.metrics,
            "last_activity": self.metrics["last_activity"]
        }

@pytest.fixture
async def redis_mock():
    """Fixture providing mock Redis instance."""
    redis = fakeredis.aioredis.FakeRedis()
    yield redis
    await redis.close()

@pytest.fixture
async def event_handler(redis_mock):
    """Fixture providing configured WebSocketEventHandler instance."""
    with patch("redis.Redis", return_value=redis_mock):
        handler = WebSocketEventHandler()
        yield handler
        # Cleanup
        for client_id in list(handler._connections.keys()):
            await handler.remove_connection(client_id)

@pytest.mark.asyncio
async def test_event_handler_initialization():
    """Test WebSocketEventHandler initialization with Redis and metrics setup."""
    with patch("redis.Redis") as redis_mock:
        handler = WebSocketEventHandler()
        
        # Verify initialization
        assert handler._connections == {}
        assert handler._connection_states == {}
        assert handler._redis_client is not None
        assert handler._pubsub is not None
        assert handler._pubsub_task is not None

@pytest.mark.asyncio
async def test_connection_management(event_handler):
    """Test WebSocket connection registration and cleanup."""
    # Test connection registration
    client_id = "test_client_1"
    connection = MockWebSocketConnection(client_id)
    
    success = await event_handler.add_connection(client_id, connection)
    assert success is True
    assert client_id in event_handler._connections
    assert client_id in event_handler._connection_states
    
    # Test connection removal
    success = await event_handler.remove_connection(client_id)
    assert success is True
    assert client_id not in event_handler._connections
    assert client_id not in event_handler._connection_states

@pytest.mark.asyncio
async def test_event_validation():
    """Test event format validation and security constraints."""
    # Valid event
    valid_event = {
        "type": EVENT_TYPES["DETECTION"],
        "action": EVENT_ACTIONS["CREATED"],
        "payload": {"id": "test_detection", "name": "Test Detection"}
    }
    assert validate_event(valid_event) is True
    
    # Invalid event type
    invalid_type_event = {
        "type": "invalid_type",
        "action": EVENT_ACTIONS["CREATED"],
        "payload": {}
    }
    assert validate_event(invalid_type_event) is False
    
    # Missing required fields
    missing_fields_event = {
        "type": EVENT_TYPES["DETECTION"]
    }
    assert validate_event(missing_fields_event) is False
    
    # Oversized payload
    large_payload = {"data": "x" * (1024 * 1024 + 1)}  # > 1MB
    oversized_event = {
        "type": EVENT_TYPES["DETECTION"],
        "action": EVENT_ACTIONS["CREATED"],
        "payload": large_payload
    }
    assert validate_event(oversized_event) is False

@pytest.mark.asyncio
async def test_event_broadcasting(event_handler):
    """Test event broadcasting to multiple connections."""
    # Setup multiple connections
    connections = []
    for i in range(3):
        client_id = f"test_client_{i}"
        connection = MockWebSocketConnection(client_id)
        await event_handler.add_connection(client_id, connection)
        connections.append(connection)
    
    # Broadcast test event
    test_event = {
        "type": EVENT_TYPES["DETECTION"],
        "action": EVENT_ACTIONS["CREATED"],
        "payload": {"id": "test_detection", "name": "Test Detection"}
    }
    
    success = await event_handler.broadcast_event(test_event)
    assert success is True
    
    # Verify all connections received the event
    for connection in connections:
        assert len(connection.received_messages) == 1
        received = connection.received_messages[0]
        assert received["type"] == test_event["type"]
        assert received["action"] == test_event["action"]
        assert received["payload"] == test_event["payload"]
        assert "timestamp" in received

@pytest.mark.asyncio
async def test_connection_monitoring(event_handler):
    """Test WebSocket connection health monitoring and metrics collection."""
    # Setup connections with different health states
    healthy_conn = MockWebSocketConnection("healthy_client", True)
    unhealthy_conn = MockWebSocketConnection("unhealthy_client", False)
    
    await event_handler.add_connection("healthy_client", healthy_conn)
    await event_handler.add_connection("unhealthy_client", unhealthy_conn)
    
    # Verify connection states
    assert "healthy_client" in event_handler._connection_states
    assert "unhealthy_client" in event_handler._connection_states
    
    # Test health checks
    healthy_status = await healthy_conn.get_health()
    assert healthy_status["is_healthy"] is True
    
    unhealthy_status = await unhealthy_conn.get_health()
    assert unhealthy_status["is_healthy"] is False

@pytest.mark.asyncio
async def test_concurrent_broadcasts(event_handler):
    """Test concurrent event broadcasting under load."""
    # Setup multiple connections
    num_connections = 50
    connections = []
    for i in range(num_connections):
        client_id = f"test_client_{i}"
        connection = MockWebSocketConnection(client_id)
        await event_handler.add_connection(client_id, connection)
        connections.append(connection)
    
    # Create multiple test events
    num_events = 10
    test_events = []
    for i in range(num_events):
        event = {
            "type": EVENT_TYPES["DETECTION"],
            "action": EVENT_ACTIONS["CREATED"],
            "payload": {"id": f"test_detection_{i}", "sequence": i}
        }
        test_events.append(event)
    
    # Broadcast events concurrently
    broadcast_tasks = [
        event_handler.broadcast_event(event) for event in test_events
    ]
    results = await asyncio.gather(*broadcast_tasks)
    
    # Verify all broadcasts succeeded
    assert all(results)
    
    # Verify all connections received all events in order
    for connection in connections:
        assert len(connection.received_messages) == num_events
        for i, received in enumerate(connection.received_messages):
            assert received["payload"]["sequence"] == test_events[i]["payload"]["sequence"]

@pytest.mark.asyncio
async def test_error_handling(event_handler):
    """Test error handling and recovery mechanisms."""
    # Test invalid connection object
    with pytest.raises(ValueError):
        await event_handler.add_connection("invalid_client", None)
    
    # Test broadcast to failed connection
    failed_conn = MockWebSocketConnection("failed_client", False)
    await event_handler.add_connection("failed_client", failed_conn)
    
    test_event = {
        "type": EVENT_TYPES["DETECTION"],
        "action": EVENT_ACTIONS["CREATED"],
        "payload": {"id": "test_detection"}
    }
    
    # Verify failed connection doesn't prevent broadcast to healthy connections
    healthy_conn = MockWebSocketConnection("healthy_client", True)
    await event_handler.add_connection("healthy_client", healthy_conn)
    
    success = await event_handler.broadcast_event(test_event)
    assert success is True
    assert len(healthy_conn.received_messages) == 1
    assert len(failed_conn.received_messages) == 0