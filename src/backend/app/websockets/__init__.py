"""
WebSocket module initialization for AI Detection Platform.
Provides core WebSocket functionality for real-time communication with enhanced monitoring,
security, and error handling capabilities.

Versions:
- datadog-api-client: 2.0.0
- circuitbreaker: 1.4.0
"""

from typing import Dict, Optional, Any
import logging
import time
from datadog import initialize, statsd
from circuitbreaker import circuit

from .connection import WebSocketConnection
from .manager import WebSocketManager
from .events import (
    WebSocketEventHandler,
    EVENT_TYPES,
    EVENT_ACTIONS,
    validate_event
)
from ..core.config import settings
from ..core.logging import get_logger

# Module version and constants
VERSION = "1.0.0"
MAX_CONNECTIONS = 10000
PROTOCOL_VERSION = "13"
HEALTH_CHECK_INTERVAL = 30

# Initialize logger
logger = get_logger(__name__)

# Initialize DataDog monitoring
initialize(
    api_key=settings.DATADOG_API_KEY.get_secret_value(),
    app_key=settings.DATADOG_APP_KEY.get_secret_value()
)

class WebSocketMetrics:
    """
    WebSocket metrics collection and monitoring with DataDog integration.
    Tracks connection stats, event processing, and system health.
    """

    @staticmethod
    def collect_metrics(metric_name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        """
        Collect and send metrics to DataDog.

        Args:
            metric_name: Name of the metric to record
            value: Metric value
            tags: Optional metric tags
        """
        try:
            metric_prefix = "websocket"
            full_metric_name = f"{metric_prefix}.{metric_name}"
            statsd.gauge(full_metric_name, value, tags=tags)
            
            logger.debug(f"Metric collected: {full_metric_name}", extra={
                "value": value,
                "tags": tags
            })
            
        except Exception as e:
            logger.error(f"Metric collection failed: {str(e)}", extra={
                "metric_name": metric_name,
                "value": value
            })

@circuit(failure_threshold=5, recovery_timeout=30)
def initialize_websocket_system() -> bool:
    """
    Initialize WebSocket system with monitoring and high availability features.

    Returns:
        bool: Initialization success status
    """
    try:
        # Initialize WebSocket manager
        manager = WebSocketManager.get_instance()
        
        # Initialize event handler
        event_handler = WebSocketEventHandler()
        
        # Record initialization metrics
        WebSocketMetrics.collect_metrics("system.initialized", 1, {
            "version": VERSION,
            "protocol": PROTOCOL_VERSION
        })
        
        logger.info("WebSocket system initialized successfully", extra={
            "version": VERSION,
            "max_connections": MAX_CONNECTIONS
        })
        return True
        
    except Exception as e:
        logger.error(f"WebSocket system initialization failed: {str(e)}")
        WebSocketMetrics.collect_metrics("system.initialization_failed", 1)
        return False

def get_system_health() -> Dict[str, Any]:
    """
    Get comprehensive system health status.

    Returns:
        Dict[str, Any]: System health information
    """
    try:
        manager = WebSocketManager.get_instance()
        stats = manager.get_connection_stats()
        
        health_info = {
            "status": "healthy" if stats["total_connections"] < MAX_CONNECTIONS else "degraded",
            "version": VERSION,
            "uptime": time.time() - stats.get("start_time", time.time()),
            "connections": {
                "current": stats["total_connections"],
                "active": stats["active_connections"],
                "max": MAX_CONNECTIONS
            },
            "circuit_breaker": {
                "status": stats["circuit_breaker_status"]
            },
            "monitoring": {
                "status": "active" if not stats["monitoring_status"] else "inactive"
            }
        }
        
        # Record health metrics
        WebSocketMetrics.collect_metrics("health.status", 
                                       1 if health_info["status"] == "healthy" else 0)
        WebSocketMetrics.collect_metrics("connections.current", 
                                       health_info["connections"]["current"])
        
        return health_info
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }

# Initialize system on module import
if not initialize_websocket_system():
    logger.critical("Failed to initialize WebSocket system")
    raise RuntimeError("WebSocket system initialization failed")

# Export public interface
__all__ = [
    'WebSocketConnection',
    'WebSocketManager',
    'WebSocketEventHandler',
    'WebSocketMetrics',
    'EVENT_TYPES',
    'EVENT_ACTIONS',
    'validate_event',
    'get_system_health',
    'VERSION',
    'PROTOCOL_VERSION'
]