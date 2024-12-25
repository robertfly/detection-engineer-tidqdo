"""
Enterprise-grade logging configuration module providing structured logging with security context,
audit trails, and monitoring integration.

Versions:
- logging: 3.11+
- python-json-logger: 2.0+
- structlog: 23.1+
- ddtrace: 1.0+
"""

import logging
import json
import hashlib
import time
from typing import Dict, Optional, Any
from datetime import datetime, timezone
from pythonjsonlogger.jsonlogger import JsonFormatter
import structlog
from ddtrace import tracer
from ddtrace.logging import DatadogFormatterV2

from .config import settings

# Global logging configuration constants
DEFAULT_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(correlation_id)s"
JSON_LOG_FORMAT = ("%(timestamp)s - %(name)s - %(level)s - %(message)s - %(environment)s - "
                  "%(trace_id)s - %(span_id)s - %(correlation_id)s")
SENSITIVE_PATTERNS = ["password", "token", "secret", "key", "auth"]

class CustomJsonFormatter(JsonFormatter):
    """
    Enhanced JSON formatter with security context, audit support, and monitoring integration.
    Provides structured logging with sensitive data filtering and trace correlation.
    """

    RESERVED_ATTRS = {
        'args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename',
        'funcName', 'levelname', 'levelno', 'lineno', 'module', 'msecs',
        'msg', 'name', 'pathname', 'process', 'processName', 'relativeCreated',
        'stack_info', 'thread', 'threadName', 'correlation_id'
    }
    TIMESTAMP_FIELD = "timestamp"
    SENSITIVE_PATTERNS = SENSITIVE_PATTERNS

    def __init__(self, format_string: str, custom_fields: Optional[Dict] = None,
                 sanitize_sensitive: bool = True) -> None:
        """
        Initialize the custom JSON formatter with security and monitoring features.

        Args:
            format_string: Log format string
            custom_fields: Additional custom fields to include
            sanitize_sensitive: Enable sensitive data sanitization
        """
        super().__init__(format_string)
        self.custom_fields = custom_fields or {}
        self.sanitize_sensitive = sanitize_sensitive
        self.hostname = self._get_hostname()

    def add_fields(self, log_record: Dict, record: logging.LogRecord,
                  message_dict: Dict) -> None:
        """
        Add enhanced fields including security context and trace information.

        Args:
            log_record: The log record to enhance
            record: Original log record
            message_dict: Additional message dictionary
        """
        # Add basic fields
        for field in self._required_fields:
            log_record[field] = record.__dict__.get(field)

        # Add timestamp in ISO 8601 format
        log_record[self.TIMESTAMP_FIELD] = datetime.fromtimestamp(
            record.created, timezone.utc).isoformat()

        # Add environment and security context
        log_record.update({
            "environment": settings.ENVIRONMENT,
            "hostname": self.hostname,
            "log_level": record.levelname,
            "logger_name": record.name,
        })

        # Add trace context if available
        if tracer and tracer.current_span():
            span = tracer.current_span()
            log_record.update({
                "trace_id": span.trace_id,
                "span_id": span.span_id,
                "service": span.service,
            })

        # Add custom fields
        log_record.update(self.custom_fields)

        # Sanitize sensitive data if enabled
        if self.sanitize_sensitive:
            self._sanitize_sensitive_data(log_record)

        # Add log integrity hash
        log_record["log_hash"] = self._generate_log_hash(log_record)

    def _sanitize_sensitive_data(self, log_record: Dict) -> None:
        """Sanitize sensitive data in log records."""
        for key, value in log_record.items():
            if isinstance(value, str):
                for pattern in self.SENSITIVE_PATTERNS:
                    if pattern.lower() in key.lower():
                        log_record[key] = "***REDACTED***"

    def _generate_log_hash(self, log_record: Dict) -> str:
        """Generate integrity hash for log record."""
        hash_content = json.dumps(log_record, sort_keys=True).encode()
        return hashlib.sha256(hash_content).hexdigest()

    @staticmethod
    def _get_hostname() -> str:
        """Get system hostname for log context."""
        import socket
        return socket.gethostname()

def configure_logging(config_override: Optional[Dict] = None) -> None:
    """
    Configure global logging settings with security context, monitoring integration, and audit trails.

    Args:
        config_override: Optional configuration override dictionary
    """
    config = {
        'level': getattr(logging, settings.LOG_LEVEL),
        'format': JSON_LOG_FORMAT,
        'handlers': ['console', 'file'],
        'propagate': True,
    }
    if config_override:
        config.update(config_override)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(config['level'])

    # Clear existing handlers
    root_logger.handlers = []

    # Console handler with JSON formatting
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(CustomJsonFormatter(config['format']))
    root_logger.addHandler(console_handler)

    # File handler with rotation
    from logging.handlers import RotatingFileHandler
    file_handler = RotatingFileHandler(
        filename='logs/app.log',
        maxBytes=10485760,  # 10MB
        backupCount=10,
        encoding='utf-8'
    )
    file_handler.setFormatter(CustomJsonFormatter(config['format']))
    root_logger.addHandler(file_handler)

    # Datadog handler for APM integration in production
    if settings.ENVIRONMENT == "production":
        dd_handler = logging.StreamHandler()
        dd_handler.setFormatter(DatadogFormatterV2())
        root_logger.addHandler(dd_handler)

    # Security audit logger
    audit_logger = logging.getLogger('security.audit')
    audit_handler = logging.FileHandler('logs/audit.log')
    audit_handler.setFormatter(CustomJsonFormatter(config['format']))
    audit_logger.addHandler(audit_handler)

    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.render_to_log_kwargs,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

def get_logger(name: str, context: Optional[Dict[str, Any]] = None) -> logging.Logger:
    """
    Get a configured logger instance with security context and monitoring capabilities.

    Args:
        name: Logger name
        context: Optional additional context dictionary

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    
    # Add context processor
    logger = structlog.wrap_logger(
        logger,
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.add_logger_name,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
        ],
        context_class=dict,
        wrapper_class=structlog.stdlib.BoundLogger,
    )

    # Add custom context if provided
    if context:
        logger = logger.bind(**context)

    # Add trace correlation if available
    if tracer and tracer.current_span():
        span = tracer.current_span()
        logger = logger.bind(
            trace_id=span.trace_id,
            span_id=span.span_id,
            service=span.service
        )

    return logger