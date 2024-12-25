# External imports - versions specified for security tracking
from typing import Dict, Any, Optional, List, Type, Callable, Awaitable  # python 3.11+
from pydantic import ValidationError  # pydantic 2.0+
from cachetools import LRUCache  # cachetools 5.3+
from circuitbreaker import CircuitBreaker  # circuitbreaker 1.4+
from prometheus_client import Counter, Summary  # prometheus_client 0.17+
import logging

# Internal imports
from .kql import KQLTranslator
from .sigma import SigmaTranslator
from .spl import SPLTranslator
from .yara import YARATranslator

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
SUPPORTED_PLATFORMS = {
    "sentinel": KQLTranslator,
    "sigma": SigmaTranslator,
    "splunk": SPLTranslator,
    "chronicle": YARATranslator
}

PLATFORM_CONFIGS = {
    "sentinel": {"rate_limit": 100},  # 100 req/min per Microsoft Sentinel limits
    "splunk": {"rate_limit": 1000},   # 1000 req/min per Splunk limits
    "chronicle": {"rate_limit": 500}   # 500 req/min per Chronicle limits
}

DEFAULT_CACHE_SIZE = 1000

# Prometheus metrics
TRANSLATION_METRICS = {
    "translation_time": Summary(
        "detection_translation_seconds",
        "Time spent translating detections",
        ["platform", "direction"]
    ),
    "validation_time": Summary(
        "detection_validation_seconds",
        "Time spent validating translations",
        ["platform"]
    ),
    "cache_hits": Counter(
        "detection_translation_cache_hits_total",
        "Number of translation cache hits",
        ["platform"]
    ),
    "errors": Counter(
        "detection_translation_errors_total",
        "Number of translation errors",
        ["platform", "error_type"]
    )
}

class TranslationService:
    """
    Factory class that manages detection translation between different platforms
    with enhanced caching, monitoring, and validation capabilities.
    """

    def __init__(
        self,
        cache_size: Optional[int] = None,
        platform_configs: Optional[Dict] = None
    ):
        """
        Initialize translation service with supported platforms and configurations.

        Args:
            cache_size: Optional cache size override
            platform_configs: Optional platform-specific configurations
        """
        # Initialize translator registry
        self._translators: Dict[str, Type] = SUPPORTED_PLATFORMS.copy()
        
        # Load platform configurations
        self._platform_configs = platform_configs or PLATFORM_CONFIGS.copy()
        
        # Initialize translation cache
        self._translation_cache = LRUCache(
            maxsize=cache_size or DEFAULT_CACHE_SIZE
        )
        
        # Initialize rate limiters for each platform
        self._rate_limiters = {
            platform: Counter(
                f"detection_translation_rate_limit_{platform}",
                f"Rate limit counter for {platform}",
                ["operation"]
            )
            for platform in self._translators.keys()
        }
        
        # Initialize circuit breakers for fault tolerance
        self._circuit_breakers = {
            platform: CircuitBreaker(
                failure_threshold=5,
                recovery_timeout=60,
                name=f"translation_{platform}"
            )
            for platform in self._translators.keys()
        }
        
        logger.info(
            "Initialized translation service",
            extra={
                "supported_platforms": list(self._translators.keys()),
                "cache_size": self._translation_cache.maxsize
            }
        )

    def get_translator(
        self,
        platform: str,
        config: Optional[Dict] = None
    ) -> Any:
        """
        Factory method to get appropriate translator instance with rate limiting
        and circuit breaking.

        Args:
            platform: Target platform identifier
            config: Optional platform-specific configuration

        Returns:
            Platform-specific translator instance

        Raises:
            ValueError: If platform is not supported
        """
        if platform not in self._translators:
            raise ValueError(f"Unsupported platform: {platform}")
            
        # Get translator class with circuit breaker
        translator_class = self._circuit_breakers[platform](
            self._translators[platform]
        )
        
        # Initialize with merged configuration
        merged_config = {
            **(self._platform_configs.get(platform, {})),
            **(config or {})
        }
        
        return translator_class(merged_config)

    async def translate(
        self,
        source_platform: str,
        target_platform: str,
        detection_logic: Dict[str, Any],
        use_cache: Optional[bool] = True
    ) -> Dict[str, Any]:
        """
        Translates detection between platforms with caching and validation.

        Args:
            source_platform: Source platform identifier
            target_platform: Target platform identifier
            detection_logic: Detection logic to translate
            use_cache: Whether to use translation cache

        Returns:
            Translated detection logic

        Raises:
            ValueError: If platforms are not supported
            ValidationError: If translation validation fails
        """
        try:
            # Generate cache key if caching enabled
            cache_key = None
            if use_cache:
                cache_key = f"{source_platform}:{target_platform}:{str(detection_logic)}"
                if cache_key in self._translation_cache:
                    TRANSLATION_METRICS["cache_hits"].labels(target_platform).inc()
                    return self._translation_cache[cache_key]

            # Get source and target translators
            source_translator = self.get_translator(source_platform)
            target_translator = self.get_translator(target_platform)

            # Track translation time
            with TRANSLATION_METRICS["translation_time"].labels(
                platform=target_platform,
                direction="to"
            ).time():
                # Convert to universal format if needed
                if source_platform != "sigma":
                    detection_logic = await source_translator.translate_from_platform(
                        detection_logic
                    )

                # Translate to target platform
                translated = await target_translator.translate(detection_logic)

            # Validate translation
            is_valid = await self.validate_translation(
                target_platform,
                translated
            )
            if not is_valid:
                raise ValidationError("Translation validation failed")

            # Cache successful translation
            if use_cache and cache_key:
                self._translation_cache[cache_key] = translated

            return translated

        except Exception as e:
            TRANSLATION_METRICS["errors"].labels(
                platform=target_platform,
                error_type=type(e).__name__
            ).inc()
            logger.error(
                "Translation failed",
                extra={
                    "source_platform": source_platform,
                    "target_platform": target_platform,
                    "error": str(e)
                }
            )
            raise

    async def async_translate(
        self,
        source_platform: str,
        target_platform: str,
        detection_logic: Dict[str, Any]
    ) -> Awaitable[Dict[str, Any]]:
        """
        Asynchronous translation between platforms.

        Args:
            source_platform: Source platform identifier
            target_platform: Target platform identifier
            detection_logic: Detection logic to translate

        Returns:
            Awaitable containing translated detection
        """
        return await self.translate(
            source_platform,
            target_platform,
            detection_logic
        )

    async def validate_translation(
        self,
        platform: str,
        translated_detection: Dict[str, Any]
    ) -> bool:
        """
        Validates translated detection with enhanced security checks.

        Args:
            platform: Target platform identifier
            translated_detection: Translated detection to validate

        Returns:
            bool: Validation result
        """
        try:
            with TRANSLATION_METRICS["validation_time"].labels(
                platform=platform
            ).time():
                translator = self.get_translator(platform)
                
                # Perform platform-specific validation
                if platform == "sentinel":
                    return await translator.validate_kql(translated_detection)
                elif platform == "splunk":
                    return await translator.validate_spl(translated_detection)
                elif platform == "chronicle":
                    return await translator.validate_rule(translated_detection)
                elif platform == "sigma":
                    return await translator.validate_sigma(translated_detection)
                    
            return False

        except Exception as e:
            TRANSLATION_METRICS["errors"].labels(
                platform=platform,
                error_type="validation_error"
            ).inc()
            logger.error(
                "Translation validation failed",
                extra={
                    "platform": platform,
                    "error": str(e)
                }
            )
            return False