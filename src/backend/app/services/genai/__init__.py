"""
GenAI service module providing AI-powered detection engineering capabilities with
comprehensive error handling, monitoring, and async support.

Versions:
- asyncio: 3.11+
- logging: 3.11+
- functools: 3.11+
"""

import asyncio
import logging
import functools
from typing import Dict, Optional

# Internal imports
from .models import OpenAIModel
from .processor import GenAIProcessor
from .prompts import (
    format_detection_prompt,
    format_translation_prompt,
    format_intelligence_prompt
)
from app.core.logging import get_logger

# Initialize logger with service context
logger = get_logger(__name__, {"service": "genai_service"})

# Module version and configuration constants
VERSION = "1.0.0"
DEFAULT_MODEL = "gpt-4-1106-preview"
DEFAULT_TEMPERATURE = 0.7
CACHE_TTL = 3600  # Cache TTL in seconds

@functools.lru_cache(maxsize=128, ttl=CACHE_TTL)
def create_processor(
    model_name: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    config: Optional[Dict] = None
) -> GenAIProcessor:
    """
    Factory function to create a configured GenAI processor instance with validation
    and monitoring capabilities.

    Args:
        model_name: Name of the AI model to use
        temperature: Model temperature setting (0.0-1.0)
        config: Optional additional configuration

    Returns:
        GenAIProcessor: Configured processor instance with monitoring hooks

    Raises:
        ValueError: If configuration validation fails
        Exception: For unexpected initialization errors
    """
    logger.info(
        "Creating GenAI processor",
        model=model_name,
        temperature=temperature
    )

    try:
        # Initialize OpenAI model with validation
        model = OpenAIModel(
            model_name=model_name,
            temperature=temperature
        )
        
        # Validate model configuration
        model.validate_config()
        
        # Create processor instance
        processor = GenAIProcessor()
        
        logger.info(
            "Successfully created GenAI processor",
            model=model_name,
            version=VERSION
        )
        
        return processor
        
    except ValueError as e:
        logger.error(
            "Configuration validation failed",
            error=str(e),
            model=model_name
        )
        raise
        
    except Exception as e:
        logger.error(
            "Processor creation failed",
            error=str(e),
            model=model_name
        )
        raise

@asyncio.coroutine
@functools.lru_cache(maxsize=128, ttl=CACHE_TTL)
async def create_processor_async(
    model_name: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    config: Optional[Dict] = None
) -> GenAIProcessor:
    """
    Factory function to create a configured async GenAI processor instance with
    validation and monitoring capabilities.

    Args:
        model_name: Name of the AI model to use
        temperature: Model temperature setting (0.0-1.0)
        config: Optional additional configuration

    Returns:
        GenAIProcessor: Configured async processor instance with monitoring hooks

    Raises:
        ValueError: If configuration validation fails
        Exception: For unexpected initialization errors
    """
    logger.info(
        "Creating async GenAI processor",
        model=model_name,
        temperature=temperature
    )

    try:
        # Initialize OpenAI model with validation
        model = OpenAIModel(
            model_name=model_name,
            temperature=temperature
        )
        
        # Validate model configuration asynchronously
        await asyncio.to_thread(model.validate_config)
        
        # Create processor instance
        processor = GenAIProcessor()
        
        logger.info(
            "Successfully created async GenAI processor",
            model=model_name,
            version=VERSION
        )
        
        return processor
        
    except ValueError as e:
        logger.error(
            "Async configuration validation failed",
            error=str(e),
            model=model_name
        )
        raise
        
    except Exception as e:
        logger.error(
            "Async processor creation failed",
            error=str(e),
            model=model_name
        )
        raise

# Export public interface
__all__ = [
    'VERSION',
    'create_processor',
    'create_processor_async',
    'OpenAIModel',
    'GenAIProcessor',
    'format_detection_prompt',
    'format_translation_prompt',
    'format_intelligence_prompt'
]