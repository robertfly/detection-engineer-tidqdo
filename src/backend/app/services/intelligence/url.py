"""
URL intelligence processor service for fetching, extracting, and processing threat intelligence
from web-based sources with enhanced error handling and monitoring capabilities.

Versions:
- aiohttp: 3.8+
- beautifulsoup4: 4.12+
- selenium: 4.0+
- pydantic: 2.0+
- tenacity: 8.0+
- prometheus_client: 0.17+
"""

import asyncio
import time
import logging
from typing import Dict, Optional, Union
from functools import wraps
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import aiohttp
from pydantic import BaseModel, ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential
from prometheus_client import Counter, Histogram

# Internal imports
from .parser import IntelligenceParser
from ...core.config import settings

# Initialize logger
logger = logging.getLogger(__name__)

# Global constants from specification
DEFAULT_URL_CONFIG = {
    'timeout': 30,
    'max_size': '10MB',
    'user_agent': 'AI-Detection-Platform/1.0',
    'follow_redirects': True,
    'max_redirects': 5,
    'verify_ssl': True,
    'retry_count': 3,
    'backoff_factor': 2,
    'circuit_breaker_threshold': 5,
    'circuit_breaker_timeout': 60
}

SUPPORTED_CONTENT_TYPES = [
    'text/html',
    'text/plain',
    'application/json',
    'application/xml',
    'application/xhtml+xml',
    'application/ld+json'
]

# Prometheus metrics
METRICS = {
    'url_processing_time': Histogram(
        'url_intelligence_processing_seconds',
        'Time spent processing URL intelligence',
        ['status']
    ),
    'url_success_total': Counter(
        'url_intelligence_success_total',
        'Total successful URL processing operations'
    ),
    'url_error_total': Counter(
        'url_intelligence_error_total',
        'Total URL processing errors',
        ['error_type']
    ),
    'url_size_bytes': Histogram(
        'url_intelligence_size_bytes',
        'Size of processed URL content in bytes'
    )
}

class URLProcessingResult(BaseModel):
    """Structured result for URL processing operations"""
    success: bool
    content: Optional[str] = None
    extracted_data: Optional[Dict] = None
    errors: list = []
    processing_time: float = 0.0
    metadata: Dict = {}

def monitor_performance(func):
    """Decorator for monitoring URL processing performance"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        try:
            result = await func(*args, **kwargs)
            processing_time = time.perf_counter() - start_time
            
            # Update metrics
            METRICS['url_processing_time'].labels(
                status='success' if result.success else 'error'
            ).observe(processing_time)
            
            if result.success:
                METRICS['url_success_total'].inc()
            else:
                METRICS['url_error_total'].labels(
                    error_type=result.errors[0]['code'] if result.errors else 'unknown'
                ).inc()
            
            return result
            
        except Exception as e:
            processing_time = time.perf_counter() - start_time
            METRICS['url_processing_time'].labels(status='error').observe(processing_time)
            METRICS['url_error_total'].labels(error_type='exception').inc()
            raise
            
    return wrapper

class URLIntelligenceProcessor:
    """
    Processes and extracts threat intelligence from web-based sources with support
    for both static and dynamic content, enhanced error handling, and performance monitoring.
    """

    def __init__(self, config: Dict = None):
        """
        Initialize URL processor with configuration and monitoring.

        Args:
            config: Custom configuration overrides
        """
        self._config = {**DEFAULT_URL_CONFIG, **(config or {})}
        
        # Initialize parser
        self._parser = IntelligenceParser()
        
        # Initialize Selenium for dynamic content
        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        self._selenium_driver = webdriver.Chrome(options=chrome_options)
        
        # Initialize aiohttp session
        self._aiohttp_session = None
        
        logger.info("Initialized URL intelligence processor")

    async def __aenter__(self):
        """Initialize async resources"""
        if not self._aiohttp_session:
            self._aiohttp_session = aiohttp.ClientSession(
                headers={'User-Agent': self._config['user_agent']},
                timeout=aiohttp.ClientTimeout(total=self._config['timeout'])
            )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Cleanup async resources"""
        if self._aiohttp_session:
            await self._aiohttp_session.close()
        if self._selenium_driver:
            self._selenium_driver.quit()

    @monitor_performance
    @retry(
        stop=stop_after_attempt(DEFAULT_URL_CONFIG['retry_count']),
        wait=wait_exponential(multiplier=DEFAULT_URL_CONFIG['backoff_factor'])
    )
    async def process_url(self, url: str, options: Optional[Dict] = None) -> URLProcessingResult:
        """
        Process intelligence from a URL synchronously with enhanced error handling.

        Args:
            url: Target URL to process
            options: Additional processing options

        Returns:
            URLProcessingResult: Structured intelligence data
        """
        start_time = time.perf_counter()
        options = options or {}
        
        try:
            # Validate URL format
            if not url.startswith(('http://', 'https://')):
                raise ValueError("Invalid URL format")

            # Determine if dynamic content processing is needed
            needs_dynamic = options.get('dynamic_content', False)
            
            if needs_dynamic:
                content = await self._fetch_dynamic_content(url)
            else:
                content = await self._fetch_static_content(url)

            # Update size metrics
            METRICS['url_size_bytes'].observe(len(content.encode('utf-8')))

            # Process content through intelligence parser
            parser_result = await self._parser.parse_text_async(
                content,
                options.get('parser_options', {})
            )

            if not parser_result.success:
                return URLProcessingResult(
                    success=False,
                    errors=parser_result.errors,
                    processing_time=time.perf_counter() - start_time,
                    metadata={'url': url, 'dynamic_content': needs_dynamic}
                )

            return URLProcessingResult(
                success=True,
                content=content,
                extracted_data=parser_result.extracted_data,
                processing_time=time.perf_counter() - start_time,
                metadata={
                    'url': url,
                    'dynamic_content': needs_dynamic,
                    'content_size': len(content),
                    'parser_metrics': parser_result.metadata
                }
            )

        except Exception as e:
            logger.error(
                "URL processing failed",
                error=str(e),
                url=url,
                options=options
            )
            return URLProcessingResult(
                success=False,
                errors=[{"code": "PROCESSING_ERROR", "message": str(e)}],
                processing_time=time.perf_counter() - start_time,
                metadata={'url': url}
            )

    async def _fetch_static_content(self, url: str) -> str:
        """
        Fetch static content using aiohttp with compression and timeout handling.

        Args:
            url: Target URL

        Returns:
            str: Extracted content
        """
        if not self._aiohttp_session:
            self._aiohttp_session = aiohttp.ClientSession(
                headers={'User-Agent': self._config['user_agent']},
                timeout=aiohttp.ClientTimeout(total=self._config['timeout'])
            )

        async with self._aiohttp_session.get(
            url,
            ssl=self._config['verify_ssl'],
            allow_redirects=self._config['follow_redirects'],
            max_redirects=self._config['max_redirects']
        ) as response:
            response.raise_for_status()
            
            content_type = response.headers.get('Content-Type', '').split(';')[0]
            if content_type not in SUPPORTED_CONTENT_TYPES:
                raise ValueError(f"Unsupported content type: {content_type}")

            content = await response.text()
            soup = BeautifulSoup(content, 'lxml')
            
            # Clean and normalize content
            for script in soup(["script", "style"]):
                script.decompose()
            
            return ' '.join(soup.stripped_strings)

    async def _fetch_dynamic_content(self, url: str) -> str:
        """
        Fetch dynamic content using Selenium with wait conditions.

        Args:
            url: Target URL

        Returns:
            str: Extracted content
        """
        loop = asyncio.get_event_loop()
        
        def _fetch():
            self._selenium_driver.get(url)
            WebDriverWait(self._selenium_driver, self._config['timeout']).until(
                EC.presence_of_element_located(("tag name", "body"))
            )
            return self._selenium_driver.page_source

        content = await loop.run_in_executor(None, _fetch)
        soup = BeautifulSoup(content, 'lxml')
        
        # Clean and normalize content
        for script in soup(["script", "style"]):
            script.decompose()
        
        return ' '.join(soup.stripped_strings)

    async def process_url_async(self, url: str, options: Optional[Dict] = None) -> URLProcessingResult:
        """
        Process intelligence from a URL asynchronously with performance optimization.

        Args:
            url: Target URL to process
            options: Additional processing options

        Returns:
            URLProcessingResult: Structured intelligence data
        """
        return await self.process_url(url, options)