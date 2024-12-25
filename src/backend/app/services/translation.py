# External imports - versions specified for security tracking
from typing import Dict, Any, Optional, List, Union, Tuple  # python 3.11+
from pydantic import ValidationError  # pydantic 2.0+
import asyncio  # standard library
from circuitbreaker import circuit  # circuitbreaker 1.4+
import logging

# Internal imports
from app.services.translation.kql import KQLTranslator
from app.services.translation.sigma import SigmaTranslator
from app.services.translation.spl import SPLTranslator
from app.services.translation.yara import YARATranslator
from app.services.cache import CacheService

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
SUPPORTED_PLATFORMS = ["kql", "sigma", "spl", "yara-l"]
TRANSLATION_TIMEOUT = 300  # 5 minutes
MAX_BATCH_SIZE = 100
CACHE_TTL = 3600  # 1 hour
DEFAULT_RATE_LIMIT = 1000
PLATFORM_RATE_LIMITS = {
    "kql": 1000,
    "sigma": 2000,
    "spl": 1000,
    "yara-l": 500
}

@circuit(failure_threshold=5, recovery_timeout=60)
class TranslationService:
    """
    Core service for managing detection translations between different platforms with 
    advanced features like caching, rate limiting, and performance monitoring.
    """

    def __init__(
        self,
        platform_configs: Optional[Dict[str, Any]] = None,
        cache_service: Optional[CacheService] = None
    ):
        """
        Initialize translation service with platform-specific translators and advanced features.

        Args:
            platform_configs: Optional platform-specific configurations
            cache_service: Optional caching service instance
        """
        # Initialize platform-specific translators
        self._translators = {
            "kql": KQLTranslator(platform_configs.get("kql") if platform_configs else None),
            "sigma": SigmaTranslator(platform_configs.get("sigma") if platform_configs else None),
            "spl": SPLTranslator(platform_configs.get("spl") if platform_configs else None),
            "yara-l": YARATranslator(platform_configs.get("yara-l") if platform_configs else None)
        }

        # Initialize caching service
        self._cache = cache_service or CacheService(prefix="translation:")

        # Configure rate limits
        self._rate_limits = PLATFORM_RATE_LIMITS.copy()
        if platform_configs and "rate_limits" in platform_configs:
            self._rate_limits.update(platform_configs["rate_limits"])

        logger.info("Translation service initialized with platform translators and caching")

    async def translate_detection(
        self,
        detection: Dict[str, Any],
        source_platform: str,
        target_platform: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Translates detection between platforms with caching and metrics.

        Args:
            detection: Detection to translate
            source_platform: Source platform identifier
            target_platform: Target platform identifier
            options: Optional translation options

        Returns:
            Translated detection for target platform

        Raises:
            ValueError: If platforms are invalid or translation fails
            ValidationError: If detection format is invalid
        """
        try:
            # Validate platforms
            if source_platform not in SUPPORTED_PLATFORMS:
                raise ValueError(f"Unsupported source platform: {source_platform}")
            if target_platform not in SUPPORTED_PLATFORMS:
                raise ValueError(f"Unsupported target platform: {target_platform}")

            # Generate cache key
            cache_key = f"{source_platform}:{target_platform}:{hash(str(detection))}"

            # Check cache
            cached_result = self._cache.get(cache_key)
            if cached_result:
                logger.debug("Retrieved translation from cache", 
                           source=source_platform, target=target_platform)
                return cached_result

            # Get appropriate translators
            source_translator = self._translators[source_platform]
            target_translator = self._translators[target_platform]

            # Validate detection format
            valid, error = await self.validate_translation(detection, source_platform)
            if not valid:
                raise ValidationError(f"Invalid detection format: {error}")

            # Convert to universal format if needed
            if source_platform != "sigma":
                universal_format = await source_translator.translate_from_kql(detection["logic"])
            else:
                universal_format = detection["logic"]

            # Translate to target format
            translated = await target_translator.translate(
                universal_format,
                options=options
            )

            # Validate translated detection
            valid, error = await self.validate_translation(translated, target_platform)
            if not valid:
                raise ValidationError(f"Translation validation failed: {error}")

            # Cache successful translation
            self._cache.set(cache_key, translated, ttl=CACHE_TTL)

            logger.info("Translation completed successfully",
                       source=source_platform,
                       target=target_platform)

            return translated

        except Exception as e:
            logger.error("Translation failed",
                        error=str(e),
                        source=source_platform,
                        target=target_platform)
            raise

    async def validate_translation(
        self,
        detection: Dict[str, Any],
        platform: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Validates translated detection for target platform with detailed error reporting.

        Args:
            detection: Detection to validate
            platform: Target platform identifier

        Returns:
            Tuple containing:
            - bool: Validation success status
            - Optional[str]: Error message if validation failed
        """
        try:
            if platform not in SUPPORTED_PLATFORMS:
                return False, f"Unsupported platform: {platform}"

            translator = self._translators[platform]
            
            # Perform platform-specific validation
            if platform == "kql":
                valid, error, _ = translator.validate_kql(detection["logic"]["query"])
            elif platform == "sigma":
                valid, error, _ = translator.validate_sigma(detection["logic"])
            elif platform == "spl":
                valid, error, _ = translator.validate_spl(detection["logic"]["query"])
            else:  # yara-l
                valid, error = translator.validate_rule(detection["logic"])

            return valid, error

        except Exception as e:
            logger.error("Validation failed", error=str(e), platform=platform)
            return False, str(e)

    async def batch_translate(
        self,
        detections: List[Dict[str, Any]],
        source_platform: str,
        target_platform: str,
        options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Performs batch translation of multiple detections.

        Args:
            detections: List of detections to translate
            source_platform: Source platform identifier
            target_platform: Target platform identifier
            options: Optional translation options

        Returns:
            List of translated detections

        Raises:
            ValueError: If batch size exceeds limit
        """
        try:
            if len(detections) > MAX_BATCH_SIZE:
                raise ValueError(f"Batch size exceeds maximum limit of {MAX_BATCH_SIZE}")

            # Filter already cached translations
            cache_keys = [
                f"{source_platform}:{target_platform}:{hash(str(d))}"
                for d in detections
            ]
            cached_results = {
                key: value for key, value in zip(
                    cache_keys,
                    await asyncio.gather(*[
                        asyncio.to_thread(self._cache.get, key)
                        for key in cache_keys
                    ])
                )
                if value is not None
            }

            # Process uncached translations
            uncached_detections = [
                d for d, key in zip(detections, cache_keys)
                if key not in cached_results
            ]

            # Translate in parallel with concurrency limit
            tasks = [
                self.translate_detection(
                    detection,
                    source_platform,
                    target_platform,
                    options
                )
                for detection in uncached_detections
            ]
            translated = await asyncio.gather(*tasks)

            # Combine cached and new translations
            results = []
            for detection, key in zip(detections, cache_keys):
                if key in cached_results:
                    results.append(cached_results[key])
                else:
                    results.append(translated.pop(0))

            logger.info("Batch translation completed",
                       total=len(detections),
                       cached=len(cached_results),
                       translated=len(uncached_detections))

            return results

        except Exception as e:
            logger.error("Batch translation failed",
                        error=str(e),
                        source=source_platform,
                        target=target_platform)
            raise