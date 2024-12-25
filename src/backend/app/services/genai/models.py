# External imports with version tracking for security
import openai  # openai v1.0+
from openai import AsyncOpenAI  # openai v1.0+
from pydantic import BaseModel  # pydantic v2.0+
import abc
from abc.abstractmethod import abstractmethod  # python 3.11+
import asyncio  # python 3.11+
import logging  # python 3.11+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0+
import time
from typing import List, Dict, Any, Optional

# Internal imports
from app.core.config import settings

# Global constants for model configuration
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 4000
DEFAULT_TOP_P = 1.0
MAX_RETRIES = 3
RETRY_DELAY = 2
REQUEST_TIMEOUT = 120

class GenAIModel(abc.ABC):
    """
    Abstract base class defining the interface for GenAI model implementations
    with enhanced error handling and monitoring capabilities.
    """
    
    def __init__(
        self,
        temperature: float = DEFAULT_TEMPERATURE,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        top_p: float = DEFAULT_TOP_P
    ):
        """
        Initialize base model parameters with logging and metrics tracking.
        
        Args:
            temperature: Controls randomness in generation (0.0-1.0)
            max_tokens: Maximum tokens in generated response
            top_p: Nucleus sampling parameter (0.0-1.0)
        """
        # Validate and set model parameters
        if not 0 <= temperature <= 1:
            raise ValueError("Temperature must be between 0 and 1")
        if not 0 <= top_p <= 1:
            raise ValueError("Top_p must be between 0 and 1")
        if max_tokens <= 0:
            raise ValueError("Max_tokens must be positive")
            
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        
        # Initialize logging
        self._logger = logging.getLogger(__name__)
        
        # Initialize metrics tracking
        self._metrics = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "total_tokens": 0,
            "average_latency": 0.0
        }

    def validate_messages(self, messages: List[Dict[str, str]]) -> bool:
        """
        Validate message format and content safety.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            bool: True if messages are valid
            
        Raises:
            ValueError: If messages are invalid
        """
        if not messages:
            raise ValueError("Messages list cannot be empty")
            
        required_keys = {"role", "content"}
        valid_roles = {"system", "user", "assistant"}
        
        for message in messages:
            # Validate message structure
            if not isinstance(message, dict):
                raise ValueError("Each message must be a dictionary")
                
            if not all(key in message for key in required_keys):
                raise ValueError(f"Messages must contain keys: {required_keys}")
                
            # Validate role
            if message["role"] not in valid_roles:
                raise ValueError(f"Invalid role. Must be one of: {valid_roles}")
                
            # Validate content
            if not isinstance(message["content"], str):
                raise ValueError("Message content must be a string")
                
            if not message["content"].strip():
                raise ValueError("Message content cannot be empty")
                
        return True

    @abstractmethod
    async def generate_async(
        self,
        messages: List[Dict[str, str]],
        options: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Asynchronously generate text with comprehensive error handling.
        
        Args:
            messages: List of conversation messages
            options: Additional generation options
            
        Returns:
            str: Generated text response
        """
        pass

    @abstractmethod
    def generate(
        self,
        messages: List[Dict[str, str]],
        options: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate text with error handling and monitoring.
        
        Args:
            messages: List of conversation messages
            options: Additional generation options
            
        Returns:
            str: Generated text response
        """
        pass

class OpenAIModel(GenAIModel):
    """
    OpenAI model implementation with robust error handling, retries, and monitoring.
    """
    
    def __init__(
        self,
        model_name: str = settings.OPENAI_MODEL_NAME,
        temperature: float = DEFAULT_TEMPERATURE,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        top_p: float = DEFAULT_TOP_P
    ):
        """
        Initialize OpenAI model with configuration and retry handling.
        
        Args:
            model_name: OpenAI model identifier
            temperature: Controls randomness in generation
            max_tokens: Maximum tokens in response
            top_p: Nucleus sampling parameter
        """
        super().__init__(temperature, max_tokens, top_p)
        
        # Initialize OpenAI clients
        openai.api_key = settings.OPENAI_API_KEY
        self._client = openai.OpenAI()
        self._async_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model_name = model_name
        
        # Configure retry state
        self._retry_state = {
            "attempts": 0,
            "last_attempt_time": 0,
            "backoff_time": RETRY_DELAY
        }

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY, min=1, max=10),
        reraise=True
    )
    def generate(
        self,
        messages: List[Dict[str, str]],
        options: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate text using OpenAI chat completion with retries.
        
        Args:
            messages: List of conversation messages
            options: Additional generation options
            
        Returns:
            str: Generated text response
            
        Raises:
            openai.OpenAIError: For API-related errors
            ValueError: For invalid input
            Exception: For unexpected errors
        """
        start_time = time.time()
        self._metrics["total_requests"] += 1
        
        try:
            # Validate messages
            self.validate_messages(messages)
            
            # Prepare request options
            request_options = {
                "model": self.model_name,
                "messages": messages,
                "temperature": self.temperature,
                "max_tokens": self.max_tokens,
                "top_p": self.top_p,
                "timeout": REQUEST_TIMEOUT
            }
            if options:
                request_options.update(options)
            
            # Make API request
            response = self._client.chat.completions.create(**request_options)
            
            # Process response
            generated_text = response.choices[0].message.content
            
            # Update metrics
            self._metrics["successful_requests"] += 1
            self._metrics["total_tokens"] += response.usage.total_tokens
            latency = time.time() - start_time
            self._metrics["average_latency"] = (
                (self._metrics["average_latency"] * (self._metrics["successful_requests"] - 1) + latency)
                / self._metrics["successful_requests"]
            )
            
            return generated_text
            
        except openai.OpenAIError as e:
            self._metrics["failed_requests"] += 1
            self._logger.error(f"OpenAI API error: {str(e)}")
            raise
            
        except Exception as e:
            self._metrics["failed_requests"] += 1
            self._logger.error(f"Unexpected error in generate: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY, min=1, max=10),
        reraise=True
    )
    async def generate_async(
        self,
        messages: List[Dict[str, str]],
        options: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Asynchronously generate text with comprehensive error handling.
        
        Args:
            messages: List of conversation messages
            options: Additional generation options
            
        Returns:
            str: Generated text response
            
        Raises:
            openai.OpenAIError: For API-related errors
            ValueError: For invalid input
            Exception: For unexpected errors
        """
        start_time = time.time()
        self._metrics["total_requests"] += 1
        
        try:
            # Validate messages
            self.validate_messages(messages)
            
            # Prepare request options
            request_options = {
                "model": self.model_name,
                "messages": messages,
                "temperature": self.temperature,
                "max_tokens": self.max_tokens,
                "top_p": self.top_p,
                "timeout": REQUEST_TIMEOUT
            }
            if options:
                request_options.update(options)
            
            # Make async API request
            response = await self._async_client.chat.completions.create(**request_options)
            
            # Process response
            generated_text = response.choices[0].message.content
            
            # Update metrics
            self._metrics["successful_requests"] += 1
            self._metrics["total_tokens"] += response.usage.total_tokens
            latency = time.time() - start_time
            self._metrics["average_latency"] = (
                (self._metrics["average_latency"] * (self._metrics["successful_requests"] - 1) + latency)
                / self._metrics["successful_requests"]
            )
            
            return generated_text
            
        except openai.OpenAIError as e:
            self._metrics["failed_requests"] += 1
            self._logger.error(f"OpenAI API error in async generation: {str(e)}")
            raise
            
        except Exception as e:
            self._metrics["failed_requests"] += 1
            self._logger.error(f"Unexpected error in generate_async: {str(e)}")
            raise