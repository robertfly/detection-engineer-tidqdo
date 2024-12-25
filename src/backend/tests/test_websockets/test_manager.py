"""
Comprehensive test suite for WebSocket connection manager, validating singleton pattern,
connection lifecycle management, event broadcasting, and monitoring integration.

Versions:
- pytest: 7.0+
- pytest_asyncio: 0.21+
- asyncio: 3.11+
- mock: 3.11+
- pytest_timeout: 2.1+
"""

import pytest
import pytest_asyncio
import asyncio
from unittest.mock import Mock, patch, AsyncMock
import json
from datetime import datetime, timezone

from app.websockets.manager import WebSocketManager
from app.websockets.connection import WebSocketConnection, CONNECTION_STATES
from app.core.config import settings

# Test constants
TEST_CLIENT_ID = "test-client-123"
TEST_EVENT = {
    "type": "detection",
    "action": "created",
    "payload": {"id": "det-123", "name": "Test Detection"},
    "timestamp": datetime.now(timezone.utc).isoformat()
}

class MockWebSocket:
    """Enhanced mock WebSocket class for testing with state management."""
    
    def __init__(self, config: dict = None):
        """Initialize mock WebSocket with monitoring capabilities."""
        self.received_messages = []
        self.is_connected = False
        self.connection_metrics = {
            "messages_sent": 0,
            "messages_received": 0,
            "errors": 0,
            "last_activity": None
        }
        self.error_state = None
        self.config = config or {}
        
    async def send_text(self, message: str, require_ack: bool = False) -> bool:
        """Mock send text message with delivery confirmation."""
        if not self.is_connected:
            raise ConnectionError("WebSocket not connected")
            
        try:
            # Validate message format
            json.loads(message)
            
            # Record message
            self.received_messages.append({
                "content": message,
                "timestamp": datetime.now(timezone.utc),
                "acknowledged": require_ack
            })
            
            # Update metrics
            self.connection_metrics["messages_sent"] += 1
            self.connection_metrics["last_activity"] = datetime.now(timezone.utc)
            
            return True
            
        except Exception as e:
            self.connection_metrics["errors"] += 1
            raise
            
    def simulate_error(self, error_type: str):
        """Simulate various WebSocket error conditions."""
        self.error_state = error_type
        if error_type == "disconnect":
            self.is_connected = False
        elif error_type == "timeout":
            raise asyncio.TimeoutError("Connection timeout")
        elif error_type == "protocol":
            raise ValueError("Protocol error")

@pytest.fixture
async def websocket_manager():
    """Fixture providing configured WebSocket manager instance."""
    manager = WebSocketManager.get_instance()
    yield manager
    # Cleanup
    for client_id in list(manager._connections.keys()):
        await manager.unregister_connection(client_id)

@pytest.fixture
def mock_websocket():
    """Fixture providing configured mock WebSocket."""
    return MockWebSocket({
        "max_message_size": 1024 * 1024,
        "ping_interval": 30,
        "timeout": 10
    })

@pytest.mark.asyncio
async def test_websocket_manager_singleton():
    """Test WebSocket manager singleton pattern with thread safety."""
    # Get first instance
    manager1 = WebSocketManager.get_instance()
    
    # Get second instance in parallel
    manager2 = WebSocketManager.get_instance()
    
    # Verify singleton
    assert manager1 is manager2
    assert WebSocketManager._instance is manager1
    
    # Verify initialization state
    assert manager1._initialized
    assert isinstance(manager1._connections, dict)
    assert isinstance(manager1._event_handler, object)

@pytest.mark.asyncio
@pytest.mark.timeout(5)
async def test_register_connection(websocket_manager, mock_websocket):
    """Test WebSocket connection registration with security validation."""
    # Prepare test data
    security_context = {
        "client_id": TEST_CLIENT_ID,
        "user_id": "test-user",
        "permissions": ["read", "write"]
    }
    
    # Register connection
    client_id = await websocket_manager.register_connection(mock_websocket)
    
    # Verify registration
    assert client_id in websocket_manager._connections
    assert isinstance(websocket_manager._connections[client_id], WebSocketConnection)
    assert websocket_manager.get_connection_count() == 1
    
    # Verify connection state
    connection = websocket_manager._connections[client_id]
    assert connection.get_connection_state() == CONNECTION_STATES["CONNECTED"]
    
    # Test duplicate registration
    with pytest.raises(ValueError):
        await websocket_manager.register_connection(mock_websocket)

@pytest.mark.asyncio
@pytest.mark.timeout(10)
async def test_connection_lifecycle(websocket_manager, mock_websocket):
    """Test complete WebSocket connection lifecycle with monitoring."""
    # Register connection
    client_id = await websocket_manager.register_connection(mock_websocket)
    
    # Verify initial state
    assert client_id in websocket_manager._connections
    connection = websocket_manager._connections[client_id]
    assert connection.get_connection_state() == CONNECTION_STATES["CONNECTED"]
    
    # Test event broadcasting
    event = TEST_EVENT.copy()
    broadcast_success = await websocket_manager.broadcast_event(event)
    assert broadcast_success
    assert len(mock_websocket.received_messages) == 1
    
    # Test connection health
    health_status = websocket_manager.get_health_status()
    assert health_status["total_connections"] == 1
    assert health_status["active_connections"] == 1
    
    # Test disconnection
    await websocket_manager.unregister_connection(client_id)
    assert client_id not in websocket_manager._connections
    assert websocket_manager.get_connection_count() == 0

@pytest.mark.asyncio
async def test_error_handling(websocket_manager, mock_websocket):
    """Test WebSocket error handling and recovery."""
    # Register connection
    client_id = await websocket_manager.register_connection(mock_websocket)
    
    # Simulate connection error
    mock_websocket.simulate_error("disconnect")
    
    # Attempt to send message
    event = TEST_EVENT.copy()
    broadcast_result = await websocket_manager.broadcast_event(event)
    assert not broadcast_result
    
    # Verify error handling
    health_status = websocket_manager.get_health_status()
    assert health_status["error_count"] > 0

@pytest.mark.asyncio
@pytest.mark.timeout(5)
async def test_broadcast_validation(websocket_manager, mock_websocket):
    """Test event broadcast validation and delivery confirmation."""
    # Register connection
    client_id = await websocket_manager.register_connection(mock_websocket)
    
    # Test invalid event
    invalid_event = {"type": "invalid"}
    with pytest.raises(ValueError):
        await websocket_manager.broadcast_event(invalid_event)
    
    # Test valid event
    valid_event = TEST_EVENT.copy()
    broadcast_success = await websocket_manager.broadcast_event(valid_event)
    assert broadcast_success
    
    # Verify message delivery
    assert len(mock_websocket.received_messages) == 1
    received = json.loads(mock_websocket.received_messages[0]["content"])
    assert received["type"] == valid_event["type"]
    assert received["payload"] == valid_event["payload"]

@pytest.mark.asyncio
async def test_connection_monitoring(websocket_manager, mock_websocket):
    """Test connection monitoring and health check functionality."""
    # Register multiple connections
    connections = []
    for i in range(3):
        mock = MockWebSocket()
        client_id = await websocket_manager.register_connection(mock)
        connections.append((client_id, mock))
    
    # Verify monitoring stats
    stats = websocket_manager.get_connection_stats()
    assert stats["total_connections"] == 3
    assert stats["active_connections"] == 3
    
    # Simulate connection issues
    connections[0][1].simulate_error("disconnect")
    
    # Wait for monitoring cycle
    await asyncio.sleep(1)
    
    # Verify updated stats
    stats = websocket_manager.get_connection_stats()
    assert stats["active_connections"] < 3
    assert stats["error_count"] > 0