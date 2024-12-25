"""
Advanced OCR processing service with enhanced preprocessing, validation, and performance optimization.
Provides both synchronous and asynchronous text extraction capabilities with comprehensive error handling.

Version: 1.0.0
"""

# External imports with version specifications
import pytesseract  # pytesseract v0.3.10+
from PIL import Image, ImageEnhance  # Pillow v10.0+
import numpy as np  # numpy v1.24+
import cv2  # opencv-python v4.8+
import asyncio
import logging
from typing import Union, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor
import io
import time

# Internal imports
from ...core.config import settings

# Global configuration
DEFAULT_OCR_CONFIG = {
    'lang': 'eng',
    'confidence_threshold': 80.0,
    'preprocessing': {
        'resize_factor': 2.0,
        'denoise': True,
        'contrast_enhancement': True,
        'adaptive_threshold': True,
        'deskew': True
    },
    'timeout': 300,
    'retry': {
        'attempts': 3,
        'backoff_factor': 1.5
    },
    'cache': {
        'enabled': True,
        'ttl': 3600
    }
}

SUPPORTED_IMAGE_FORMATS = ['PNG', 'JPEG', 'TIFF', 'BMP', 'GIF', 'WEBP', 'HEIC']

class OCRProcessor:
    """
    Advanced OCR processing class with enhanced preprocessing, validation, and performance optimization.
    Implements comprehensive image processing pipeline for optimal text extraction.
    """

    def __init__(self, config: dict = None, enable_cache: bool = True, enable_metrics: bool = True):
        """
        Initialize OCR processor with advanced configuration.

        Args:
            config (dict): Custom configuration overrides
            enable_cache (bool): Enable result caching
            enable_metrics (bool): Enable performance metrics collection
        """
        self._config = {**DEFAULT_OCR_CONFIG, **(config or {})}
        
        # Initialize logger with custom format
        self._logger = logging.getLogger(__name__)
        self._logger.setLevel(settings.LOG_LEVEL)
        
        # Validate Tesseract installation
        try:
            pytesseract.get_tesseract_version()
        except Exception as e:
            self._logger.error(f"Tesseract installation error: {e}")
            raise RuntimeError("Tesseract OCR is not properly installed")

        # Initialize cache if enabled
        self._cache = {} if enable_cache else None
        
        # Initialize metrics collection
        self._metrics = {} if enable_metrics else None

    def preprocess_image(self, image: np.ndarray, preprocessing_config: dict) -> np.ndarray:
        """
        Apply enhanced preprocessing pipeline for optimal OCR accuracy.

        Args:
            image (np.ndarray): Input image array
            preprocessing_config (dict): Preprocessing configuration

        Returns:
            np.ndarray: Optimally preprocessed image
        """
        try:
            # Convert to grayscale if needed
            if len(image.shape) == 3:
                image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

            # Dynamic resize based on image quality
            if preprocessing_config['resize_factor'] > 1.0:
                height, width = image.shape[:2]
                new_size = (int(width * preprocessing_config['resize_factor']),
                          int(height * preprocessing_config['resize_factor']))
                image = cv2.resize(image, new_size, interpolation=cv2.INTER_CUBIC)

            # Advanced denoising
            if preprocessing_config['denoise']:
                image = cv2.fastNlMeansDenoising(image)

            # Adaptive contrast enhancement
            if preprocessing_config['contrast_enhancement']:
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                image = clahe.apply(image)

            # Automatic deskewing
            if preprocessing_config['deskew']:
                coords = np.column_stack(np.where(image > 0))
                angle = cv2.minAreaRect(coords)[-1]
                if angle < -45:
                    angle = 90 + angle
                center = tuple(np.array(image.shape[1::-1]) / 2)
                rot_mat = cv2.getRotationMatrix2D(center, angle, 1.0)
                image = cv2.warpAffine(image, rot_mat, image.shape[1::-1],
                                     flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

            # Adaptive thresholding
            if preprocessing_config['adaptive_threshold']:
                image = cv2.adaptiveThreshold(image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                           cv2.THRESH_BINARY, 11, 2)

            return image

        except Exception as e:
            self._logger.error(f"Preprocessing failed: {e}")
            raise

    async def extract_text_async(self, image_data: Union[str, bytes, np.ndarray],
                               options: dict = None) -> dict:
        """
        Asynchronously extract text with enhanced error handling.

        Args:
            image_data: Input image data (file path, bytes, or numpy array)
            options: Custom extraction options

        Returns:
            dict: Extracted text with confidence scores and processing metrics
        """
        start_time = time.time()
        options = options or {}
        
        try:
            # Check cache if enabled
            cache_key = str(hash(str(image_data)))
            if self._cache is not None and cache_key in self._cache:
                self._logger.debug("Cache hit for image")
                return self._cache[cache_key]

            # Load and validate image
            if isinstance(image_data, str):
                image = cv2.imread(image_data)
            elif isinstance(image_data, bytes):
                nparr = np.frombuffer(image_data, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            else:
                image = image_data

            if image is None:
                raise ValueError("Failed to load image data")

            # Process image in thread pool
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor() as pool:
                # Preprocess image
                preprocessed = await loop.run_in_executor(
                    pool,
                    self.preprocess_image,
                    image,
                    self._config['preprocessing']
                )

                # Perform OCR with retries
                for attempt in range(self._config['retry']['attempts']):
                    try:
                        ocr_result = await loop.run_in_executor(
                            pool,
                            pytesseract.image_to_data,
                            Image.fromarray(preprocessed),
                            output_type=pytesseract.Output.DICT,
                            lang=self._config['lang']
                        )
                        break
                    except Exception as e:
                        if attempt == self._config['retry']['attempts'] - 1:
                            raise
                        await asyncio.sleep(self._config['retry']['backoff_factor'] ** attempt)

            # Validate results
            validation_result = await loop.run_in_executor(
                pool,
                self.validate_results,
                ocr_result,
                {'confidence_threshold': self._config['confidence_threshold']}
            )

            # Prepare response
            processing_time = time.time() - start_time
            result = {
                'text': ' '.join([word for word, conf in zip(ocr_result['text'], ocr_result['conf'])
                                if conf >= self._config['confidence_threshold'] and word.strip()]),
                'confidence_scores': ocr_result['conf'],
                'validation': validation_result,
                'processing_time': processing_time,
                'language': self._config['lang']
            }

            # Update cache if enabled
            if self._cache is not None:
                self._cache[cache_key] = result

            # Update metrics if enabled
            if self._metrics is not None:
                self._metrics[time.time()] = {
                    'processing_time': processing_time,
                    'validation_status': validation_result[0],
                    'image_size': image.shape
                }

            return result

        except Exception as e:
            self._logger.error(f"Async text extraction failed: {e}")
            raise

    def extract_text(self, image_data: Union[str, bytes, np.ndarray], options: dict = None) -> dict:
        """
        Extract text with enhanced accuracy and validation.

        Args:
            image_data: Input image data (file path, bytes, or numpy array)
            options: Custom extraction options

        Returns:
            dict: Extracted text with detailed confidence scores and quality metrics
        """
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(self.extract_text_async(image_data, options))

    def validate_results(self, ocr_results: dict, validation_config: dict) -> Tuple[bool, str, dict]:
        """
        Comprehensive validation of OCR results.

        Args:
            ocr_results: OCR extraction results
            validation_config: Validation configuration

        Returns:
            Tuple[bool, str, dict]: Validation status, message, and quality metrics
        """
        confidence_threshold = validation_config.get('confidence_threshold',
                                                   self._config['confidence_threshold'])
        
        # Analyze confidence scores
        confidence_scores = np.array(ocr_results['conf'])
        valid_scores = confidence_scores[confidence_scores >= 0]  # Filter out -1 values
        
        if len(valid_scores) == 0:
            return False, "No valid text detected", {'mean_confidence': 0, 'valid_words': 0}

        mean_confidence = np.mean(valid_scores)
        valid_words = sum(1 for conf in valid_scores if conf >= confidence_threshold)
        total_words = len(valid_scores)

        # Calculate quality metrics
        quality_metrics = {
            'mean_confidence': float(mean_confidence),
            'valid_words': valid_words,
            'total_words': total_words,
            'valid_word_ratio': valid_words / total_words if total_words > 0 else 0,
            'word_count': total_words
        }

        # Validation criteria
        is_valid = (
            mean_confidence >= confidence_threshold and
            valid_words >= 1 and
            quality_metrics['valid_word_ratio'] >= 0.5
        )

        message = (
            "Validation successful" if is_valid
            else f"Validation failed: Mean confidence {mean_confidence:.1f}% below threshold"
        )

        return is_valid, message, quality_metrics