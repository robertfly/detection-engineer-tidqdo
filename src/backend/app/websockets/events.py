"""
WebSocket event handling and broadcasting system for the AI Detection Platform.
Implements real-time event distribution with Redis pub/sub, connection management,
error handling, monitoring, and security validation.

Versions:
- redis: 4.5+
- jsonschema: 4.17+
- asyncio: 3.11+
"""

import asyncio
import json
from typing import Dict, Optional, Set
from redis import Redis
from jsonschema import validate, ValidationError

from .connection import WebSocketConnection
from ...core.config import Settings
from ...core.logging import Logger, get_logger

# Event type constants
EVENT_TYPES = {
    "DETECTION": "detection",
    "INTELLIGENCE": "intelligence",
    "COVERAGE": "coverage",
    "TRANSLATION": "translation"
}

# Event action constants
EVENT_ACTIONS = {
    "CREATED": "created",
    "UPDATED": "updated",
    "DELETED": "deleted",
    "PROCESSED": "processed",
    "COMPLETED": "completed",
    "FAILED": "failed"
}

# Redis channel for event distribution
REDIS_CHANNEL = "websocket_events"

# Event validation schema
EVENT_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": list(EVENT_TYPES.values())},
        "action": {"type": "string", "enum": list(EVENT_ACTIONS.values())},
        "payload": {"type": "object"},
        "timestamp": {"type": "string"},
        "client_id": {"type": "string"},
        "metadata": {"type": "object"}
    },
    "required": ["type", "action", "payload"]
}

# Retry configuration
MAX_RETRY_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1

def validate_event(event: Dict) -> bool:
    """
    Validates event format, content, and security constraints before broadcasting.

    Args:
        event: Event dictionary to validate

    Returns:
        bool: Event validation status
    """
    try:
        # Schema validation
        validate(instance=event, schema=EVENT_SCHEMA)

        # Payload size validation (prevent DoS)
        payload_size = len(json.dumps(event["payload"]))
        if payload_size > 1024 * 1024:  # 1MB limit
            return False

        # Security validation
        if "client_id" in event:
            if not isinstance(event["client_id"], str) or len(event["client_id"]) > 64:
                return False

        return True

    except ValidationError:
        return False
    except Exception as e:
        logger = get_logger(__name__)
        logger.error(f"Event validation error: {str(e)}", extra={"event": event})
        return False

class WebSocketEventHandler:
    """
    Manages WebSocket event broadcasting with Redis pub/sub, connection state,
    error handling, and monitoring.
    """

    def __init__(self):
        """Initialize event handler with Redis connection and monitoring."""
        self._connections: Dict[str, WebSocketConnection] = {}
        self._connection_states: Dict[str, Dict] = {}
        self._logger = get_logger(__name__, {"service": "websocket_handler"})
        
        # Initialize Redis with connection pooling
        self._redis_client = Redis.from_url(
            Settings().get_redis_url(),
            max_connections=Settings().REDIS_MAX_CONNECTIONS,
            decode_responses=True
        )
        
        # Initialize Redis pub/sub
        self._pubsub = self._redis_client.pubsub()
        self._pubsub.subscribe(REDIS_CHANNEL)
        
        # Start pub/sub listener
        self._pubsub_task = asyncio.create_task(self._handle_redis_messages())
        
        self._logger.info("WebSocket event handler initialized")

    async def add_connection(self, client_id: str, connection: WebSocketConnection) -> bool:
        """
        Register new WebSocket connection with state management.

        Args:
            client_id: Unique client identifier
            connection: WebSocket connection instance

        Returns:
            bool: Registration success status
        """
        try:
            if not isinstance(connection, WebSocketConnection):
                raise ValueError("Invalid connection object")

            self._connections[client_id] = connection
            self._connection_states[client_id] = {
                "connected_at": asyncio.get_event_loop().time(),
                "last_activity": asyncio.get_event_loop().time(),
                "message_count": 0
            }

            self._logger.info("Client connected", extra={
                "client_id": client_id,
                "connection_id": id(connection)
            })
            return True

        except Exception as e:
            self._logger.error(f"Connection registration error: {str(e)}", extra={
                "client_id": client_id
            })
            return False

    async def remove_connection(self, client_id: str) -> bool:
        """
        Unregister WebSocket connection with cleanup.

        Args:
            client_id: Client identifier to remove

        Returns:
            bool: Unregistration success status
        """
        try:
            if client_id in self._connections:
                connection = self._connections[client_id]
                await connection.disconnect()
                del self._connections[client_id]
                del self._connection_states[client_id]

                self._logger.info("Client disconnected", extra={"client_id": client_id})
                return True

            return False

        except Exception as e:
            self._logger.error(f"Connection removal error: {str(e)}", extra={
                "client_id": client_id
            })
            return False

    async def broadcast_event(self, event: Dict) -> bool:
        """
        Broadcast event with retry and error handling.

        Args:
            event: Event dictionary to broadcast

        Returns:
            bool: Broadcast success status
        """
        try:
            # Validate event
            if not validate_event(event):
                raise ValueError("Invalid event format")

            # Add timestamp if not present
            if "timestamp" not in event:
                from datetime import datetime, timezone
                event["timestamp"] = datetime.now(timezone.utc).isoformat()

            # Publish to Redis
            retry_count = 0
            while retry_count < MAX_RETRY_ATTEMPTS:
                try:
                    self._redis_client.publish(REDIS_CHANNEL, json.dumps(event))
                    break
                except Exception as e:
                    retry_count += 1
                    if retry_count == MAX_RETRY_ATTEMPTS:
                        raise e
                    await asyncio.sleep(RETRY_DELAY_SECONDS)

            # Direct broadcast to connected clients
            broadcast_tasks = []
            for client_id, connection in self._connections.items():
                if connection.is_active:
                    task = asyncio.create_task(
                        self._send_to_client(client_id, connection, event)
                    )
                    broadcast_tasks.append(task)

            # Wait for broadcasts to complete
            if broadcast_tasks:
                await asyncio.gather(*broadcast_tasks, return_exceptions=True)

            self._logger.info("Event broadcast complete", extra={
                "event_type": event["type"],
                "recipients": len(broadcast_tasks)
            })
            return True

        except Exception as e:
            self._logger.error(f"Event broadcast error: {str(e)}", extra={
                "event": event
            })
            return False

    async def _handle_redis_messages(self):
        """Handle incoming Redis pub/sub messages."""
        try:
            while True:
                message = self._pubsub.get_message(ignore_subscribe_messages=True)
                if message and message["type"] == "message":
                    event = json.loads(message["data"])
                    if validate_event(event):
                        await self.broadcast_event(event)
                await asyncio.sleep(0.01)

        except Exception as e:
            self._logger.error(f"Redis message handler error: {str(e)}")
            # Attempt to reconnect
            await self._reconnect_redis()

    async def _send_to_client(self, client_id: str, connection: WebSocketConnection, 
                            event: Dict) -> bool:
        """
        Send event to specific client with error handling.

        Args:
            client_id: Target client identifier
            connection: Client's WebSocket connection
            event: Event to send

        Returns:
            bool: Send success status
        """
        try:
            success = await connection.send_message(event)
            if success:
                self._connection_states[client_id]["message_count"] += 1
                self._connection_states[client_id]["last_activity"] = \
                    asyncio.get_event_loop().time()
            return success

        except Exception as e:
            await self.handle_connection_error(client_id, e)
            return False

    async def handle_connection_error(self, client_id: str, error: Exception):
        """
        Handle connection errors with recovery.

        Args:
            client_id: Affected client identifier
            error: Exception that occurred
        """
        self._logger.error(f"Connection error: {str(error)}", extra={
            "client_id": client_id,
            "error_type": type(error).__name__
        })

        try:
            # Attempt connection recovery
            connection = self._connections.get(client_id)
            if connection:
                await connection.handle_reconnection()
            else:
                await self.remove_connection(client_id)

        except Exception as e:
            self._logger.error(f"Error recovery failed: {str(e)}", extra={
                "client_id": client_id
            })
            await self.remove_connection(client_id)

    async def _reconnect_redis(self):
        """Attempt to reconnect to Redis with exponential backoff."""
        retry_count = 0
        while retry_count < MAX_RETRY_ATTEMPTS:
            try:
                self._redis_client = Redis.from_url(
                    Settings().get_redis_url(),
                    max_connections=Settings().REDIS_MAX_CONNECTIONS,
                    decode_responses=True
                )
                self._pubsub = self._redis_client.pubsub()
                self._pubsub.subscribe(REDIS_CHANNEL)
                self._logger.info("Redis reconnection successful")
                return True

            except Exception as e:
                retry_count += 1
                await asyncio.sleep(RETRY_DELAY_SECONDS * (2 ** retry_count))

        self._logger.error("Redis reconnection failed after maximum attempts")
        return False