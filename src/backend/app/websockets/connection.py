"""
WebSocket connection handler for the AI Detection Platform.
Manages individual WebSocket connections with enhanced reliability and monitoring.

Versions:
- fastapi: 0.104+
- jsonschema: 4.19+
- asyncio: 3.11+
"""

from fastapi import WebSocket, WebSocketDisconnect, WebSocketState
from jsonschema import validate, ValidationError
import asyncio
import json
import time
from typing import Dict, Optional, Any

from ...core.config import Settings
from ...core.logging import get_logger

# Connection state constants
CONNECTION_STATES = {
    "CONNECTING": 0,
    "CONNECTED": 1,
    "DISCONNECTING": 2,
    "DISCONNECTED": 3,
    "RECONNECTING": 4
}

# Message validation schema
MESSAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string"},
        "payload": {"type": "object"},
        "timestamp": {"type": "string"}
    },
    "required": ["type", "payload"]
}

def validate_message(message: Dict) -> bool:
    """
    Validates incoming WebSocket message format and content against schema.

    Args:
        message: Dictionary containing the message to validate

    Returns:
        bool: True if message is valid, False otherwise
    """
    try:
        # Ensure message is valid JSON
        if not isinstance(message, dict):
            return False

        # Validate against schema
        validate(instance=message, schema=MESSAGE_SCHEMA)

        # Validate message type is supported
        supported_types = {"detection", "intelligence", "coverage", "translation"}
        if message["type"] not in supported_types:
            return False

        return True
    except ValidationError:
        return False
    except Exception as e:
        logger = get_logger(__name__)
        logger.error(f"Message validation error: {str(e)}", extra={"message": message})
        return False

class WebSocketConnection:
    """
    Manages individual WebSocket connection lifecycle with enhanced reliability and monitoring.
    Implements automatic reconnection, message queuing, and health monitoring.
    """

    def __init__(self, websocket: WebSocket, client_id: str):
        """
        Initialize WebSocket connection with monitoring capabilities.

        Args:
            websocket: FastAPI WebSocket instance
            client_id: Unique client identifier
        """
        self._websocket = websocket
        self._client_id = client_id
        self._state = CONNECTION_STATES["DISCONNECTED"]
        self._ping_task: Optional[asyncio.Task] = None
        self._last_ping = time.time()
        self._reconnect_attempts = 0
        self._message_queue: Dict[str, Any] = {}
        self._logger = get_logger(
            __name__,
            {"client_id": client_id, "connection_id": id(self)}
        )

    async def connect(self) -> bool:
        """
        Establish WebSocket connection with retry mechanism.

        Returns:
            bool: Connection success status
        """
        try:
            self._state = CONNECTION_STATES["CONNECTING"]
            await self._websocket.accept()
            
            # Start ping/pong monitoring
            self._ping_task = asyncio.create_task(self._ping_monitor())
            
            # Process any queued messages
            await self._process_message_queue()
            
            self._state = CONNECTION_STATES["CONNECTED"]
            self._reconnect_attempts = 0
            
            self._logger.info("WebSocket connection established", 
                            extra={"state": "connected"})
            return True
            
        except Exception as e:
            self._logger.error(f"Connection failed: {str(e)}")
            self._state = CONNECTION_STATES["DISCONNECTED"]
            return False

    async def disconnect(self) -> bool:
        """
        Gracefully close WebSocket connection with cleanup.

        Returns:
            bool: Disconnection success status
        """
        try:
            self._state = CONNECTION_STATES["DISCONNECTING"]
            
            # Cancel ping monitoring
            if self._ping_task:
                self._ping_task.cancel()
                try:
                    await self._ping_task
                except asyncio.CancelledError:
                    pass
                
            # Close connection
            if self._websocket.client_state != WebSocketState.DISCONNECTED:
                await self._websocket.close()
                
            self._state = CONNECTION_STATES["DISCONNECTED"]
            self._logger.info("WebSocket connection closed", 
                            extra={"state": "disconnected"})
            return True
            
        except Exception as e:
            self._logger.error(f"Disconnection error: {str(e)}")
            return False

    async def send_message(self, message: Dict) -> bool:
        """
        Send message with retry and queuing capabilities.

        Args:
            message: Dictionary containing the message to send

        Returns:
            bool: Message send success status
        """
        try:
            # Validate message format
            if not validate_message(message):
                raise ValueError("Invalid message format")

            # Queue message if not connected
            if self._state != CONNECTION_STATES["CONNECTED"]:
                message_id = str(time.time())
                self._message_queue[message_id] = message
                self._logger.info("Message queued", 
                                extra={"message_id": message_id})
                return False

            # Add timestamp if not present
            if "timestamp" not in message:
                message["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

            # Send message with retry
            retry_count = 0
            while retry_count < 3:
                try:
                    await self._websocket.send_json(message)
                    self._logger.info("Message sent successfully", 
                                    extra={"message_type": message["type"]})
                    return True
                except Exception as e:
                    retry_count += 1
                    if retry_count == 3:
                        raise e
                    await asyncio.sleep(0.5)

        except Exception as e:
            self._logger.error(f"Send message error: {str(e)}", 
                             extra={"message": message})
            return False

    async def receive_message(self) -> Optional[Dict]:
        """
        Receive and validate incoming WebSocket message.

        Returns:
            Optional[Dict]: Received and validated message or None if invalid
        """
        try:
            raw_message = await self._websocket.receive_text()
            message = json.loads(raw_message)

            if not validate_message(message):
                self._logger.warning("Invalid message received", 
                                   extra={"raw_message": raw_message})
                return None

            self._logger.info("Message received", 
                            extra={"message_type": message["type"]})
            return message

        except WebSocketDisconnect:
            self._logger.info("Client disconnected during message receive")
            await self.handle_reconnection()
            return None
        except Exception as e:
            self._logger.error(f"Receive message error: {str(e)}")
            return None

    async def _ping_monitor(self):
        """
        Monitor connection health with ping/pong messages.
        """
        while self._state == CONNECTION_STATES["CONNECTED"]:
            try:
                await self._websocket.send_bytes(b"ping")
                self._last_ping = time.time()
                await asyncio.sleep(Settings.WEBSOCKET_PING_INTERVAL)
                
                # Check for ping timeout
                if time.time() - self._last_ping > Settings.WEBSOCKET_PING_TIMEOUT:
                    self._logger.warning("Ping timeout detected")
                    await self.handle_reconnection()
                    
            except Exception as e:
                self._logger.error(f"Ping monitor error: {str(e)}")
                await self.handle_reconnection()
                break

    async def handle_reconnection(self) -> bool:
        """
        Manage connection recovery with exponential backoff.

        Returns:
            bool: Reconnection success status
        """
        if self._reconnect_attempts >= Settings.WEBSOCKET_MAX_RECONNECT_ATTEMPTS:
            self._logger.error("Max reconnection attempts reached")
            await self.disconnect()
            return False

        self._state = CONNECTION_STATES["RECONNECTING"]
        self._reconnect_attempts += 1

        # Calculate backoff delay
        backoff = min(1 * (2 ** self._reconnect_attempts), 30)
        self._logger.info(f"Attempting reconnection in {backoff} seconds", 
                         extra={"attempt": self._reconnect_attempts})

        await asyncio.sleep(backoff)

        # Attempt reconnection
        success = await self.connect()
        if success:
            self._logger.info("Reconnection successful")
            return True
        
        self._logger.warning("Reconnection failed")
        return False

    async def _process_message_queue(self):
        """
        Process queued messages after reconnection.
        """
        for message_id, message in list(self._message_queue.items()):
            if await self.send_message(message):
                del self._message_queue[message_id]