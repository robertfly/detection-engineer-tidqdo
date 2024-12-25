"""
WebSocket connection manager for the AI Detection Platform.
Implements connection lifecycle management, event broadcasting, and monitoring
with enhanced reliability and high availability features.

Versions:
- asyncio: 3.11+
- aioredis: 2.0+
- circuitbreaker: 1.4+
"""

import asyncio
import uuid
import logging
from typing import Dict, Optional, Any
import aioredis
from circuitbreaker import circuit

from .connection import WebSocketConnection
from .events import WebSocketEventHandler
from ...core.config import settings
from ...core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# Constants
HEALTH_CHECK_INTERVAL = 30  # seconds
STALE_CONNECTION_TIMEOUT = 300  # seconds

class WebSocketManager:
    """
    Enhanced singleton manager for WebSocket connections with monitoring,
    rate limiting, and high availability features.
    """
    
    _instance = None
    _initialized = False
    
    def __init__(self):
        """Initialize WebSocket manager with enhanced monitoring and HA features."""
        if WebSocketManager._initialized:
            return
            
        # Initialize connection storage
        self._connections: Dict[str, WebSocketConnection] = {}
        self._event_handler = WebSocketEventHandler()
        self._lock = asyncio.Lock()
        
        # Initialize Redis for cross-instance coordination
        self._redis = aioredis.from_url(
            settings.get_redis_url(),
            max_connections=50,
            decode_responses=True
        )
        
        # Initialize rate limiting
        self._rate_limits: Dict[str, Dict] = {}
        
        # Start health check task
        self._health_check_task = asyncio.create_task(self._monitor_connections())
        
        # Initialize circuit breaker
        self._circuit_breaker = circuit(
            failure_threshold=5,
            recovery_timeout=30,
            expected_exception=Exception
        )
        
        WebSocketManager._initialized = True
        logger.info("WebSocket manager initialized")

    @classmethod
    def get_instance(cls) -> 'WebSocketManager':
        """
        Get or create singleton instance of WebSocket manager.
        
        Returns:
            WebSocketManager: Singleton manager instance
        """
        if cls._instance is None:
            cls._instance = WebSocketManager()
        return cls._instance

    @circuit
    async def register_connection(self, websocket: Any) -> str:
        """
        Register new WebSocket connection with enhanced validation and monitoring.
        
        Args:
            websocket: WebSocket connection instance
            
        Returns:
            str: Generated client ID
            
        Raises:
            ValueError: If connection parameters are invalid
            Exception: If registration fails
        """
        try:
            # Generate unique client ID
            client_id = str(uuid.uuid4())
            
            async with self._lock:
                # Validate connection limits
                if len(self._connections) >= settings.MAX_CONNECTIONS:
                    raise ValueError("Maximum connections reached")
                
                # Initialize rate limiting
                self._rate_limits[client_id] = {
                    "message_count": 0,
                    "last_reset": asyncio.get_event_loop().time()
                }
                
                # Create and store connection
                connection = WebSocketConnection(websocket, client_id)
                self._connections[client_id] = connection
                
                # Register with event handler
                await self._event_handler.add_connection(client_id, connection)
                
                # Establish connection
                success = await connection.connect()
                if not success:
                    raise Exception("Connection establishment failed")
                
                logger.info("New connection registered", extra={
                    "client_id": client_id,
                    "total_connections": len(self._connections)
                })
                
                return client_id
                
        except Exception as e:
            logger.error(f"Connection registration failed: {str(e)}")
            # Cleanup any partial registration
            await self.unregister_connection(client_id)
            raise

    async def unregister_connection(self, client_id: str) -> bool:
        """
        Unregister and cleanup WebSocket connection with monitoring.
        
        Args:
            client_id: Client identifier to unregister
            
        Returns:
            bool: Unregister success status
        """
        try:
            async with self._lock:
                if client_id in self._connections:
                    # Get connection instance
                    connection = self._connections[client_id]
                    
                    # Unregister from event handler
                    await self._event_handler.remove_connection(client_id)
                    
                    # Close connection
                    await connection.disconnect()
                    
                    # Remove from storage
                    del self._connections[client_id]
                    if client_id in self._rate_limits:
                        del self._rate_limits[client_id]
                    
                    logger.info("Connection unregistered", extra={
                        "client_id": client_id,
                        "total_connections": len(self._connections)
                    })
                    return True
                    
            return False
            
        except Exception as e:
            logger.error(f"Connection unregister failed: {str(e)}", extra={
                "client_id": client_id
            })
            return False

    @circuit
    async def broadcast_event(self, event: Dict) -> bool:
        """
        Broadcast event with rate limiting and monitoring.
        
        Args:
            event: Event dictionary to broadcast
            
        Returns:
            bool: Broadcast success status
        """
        try:
            # Broadcast via event handler
            success = await self._event_handler.broadcast_event(event)
            
            if success:
                logger.info("Event broadcast successful", extra={
                    "event_type": event.get("type"),
                    "recipients": len(self._connections)
                })
            else:
                logger.warning("Event broadcast partially failed", extra={
                    "event_type": event.get("type")
                })
                
            return success
            
        except Exception as e:
            logger.error(f"Event broadcast failed: {str(e)}")
            return False

    async def _monitor_connections(self) -> None:
        """Periodic health check and cleanup of connections."""
        while True:
            try:
                current_time = asyncio.get_event_loop().time()
                
                async with self._lock:
                    # Check each connection
                    for client_id, connection in list(self._connections.items()):
                        try:
                            # Perform health check
                            if not await connection.health_check():
                                logger.warning("Connection health check failed", extra={
                                    "client_id": client_id
                                })
                                await self.unregister_connection(client_id)
                                continue
                                
                            # Check for stale connections
                            rate_info = self._rate_limits.get(client_id, {})
                            last_activity = rate_info.get("last_reset", 0)
                            if current_time - last_activity > STALE_CONNECTION_TIMEOUT:
                                logger.info("Removing stale connection", extra={
                                    "client_id": client_id,
                                    "idle_time": current_time - last_activity
                                })
                                await self.unregister_connection(client_id)
                                
                        except Exception as e:
                            logger.error(f"Connection monitoring error: {str(e)}", extra={
                                "client_id": client_id
                            })
                            
                # Reset rate limits periodically
                for client_id in list(self._rate_limits.keys()):
                    self._rate_limits[client_id]["message_count"] = 0
                    self._rate_limits[client_id]["last_reset"] = current_time
                    
                logger.info("Connection monitoring complete", extra={
                    "active_connections": len(self._connections)
                })
                    
            except Exception as e:
                logger.error(f"Connection monitoring cycle failed: {str(e)}")
                
            finally:
                await asyncio.sleep(HEALTH_CHECK_INTERVAL)

    def get_connection_stats(self) -> Dict[str, Any]:
        """
        Get detailed connection statistics.
        
        Returns:
            dict: Connection statistics and metrics
        """
        return {
            "total_connections": len(self._connections),
            "active_connections": sum(1 for c in self._connections.values() if c.is_active),
            "rate_limits": {
                client_id: {
                    "message_count": info["message_count"],
                    "time_since_reset": asyncio.get_event_loop().time() - info["last_reset"]
                }
                for client_id, info in self._rate_limits.items()
            },
            "circuit_breaker_status": self._circuit_breaker.current_state,
            "monitoring_status": self._health_check_task.done()
        }