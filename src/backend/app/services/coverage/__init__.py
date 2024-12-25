"""
Coverage service initialization module providing thread-safe access to coverage analysis,
mapping, and MITRE ATT&CK framework functionality with enhanced monitoring.

Versions:
- sqlalchemy: 2.0+
- redis: 4.5+
- threading: 3.11+
- datadog: 1.0+
"""

from sqlalchemy.ext.asyncio import AsyncSession
from redis import Redis
from threading import Lock
import datadog
from typing import Optional, Dict

# Internal imports
from app.services.coverage.analyzer import CoverageAnalyzer
from app.services.coverage.mapper import CoverageMapper
from app.services.coverage.mitre import MITREService
from app.core.logging import ServiceLogger

# Global version and configuration constants
VERSION = '1.0.0'
COVERAGE_PACKAGE_NAME = 'coverage'
CACHE_VERSION = '1.0.0'
SERVICE_TIMEOUT = 30

class CoverageService:
    """
    Thread-safe factory class for instantiating and managing coverage service components
    with enhanced lifecycle management and monitoring.
    """

    def __init__(self, db_session: AsyncSession, cache: Redis):
        """
        Initialize coverage service with enhanced monitoring and thread safety.

        Args:
            db_session: Async database session for persistence
            cache: Redis instance for caching
        """
        # Initialize thread safety
        self._instance_lock = Lock()
        
        # Store core dependencies
        self.db_session = db_session
        self.cache = cache
        
        # Initialize service logger
        self.logger = ServiceLogger(COVERAGE_PACKAGE_NAME, {
            'version': VERSION,
            'cache_version': CACHE_VERSION
        })
        
        # Initialize service components
        self._analyzer: Optional[CoverageAnalyzer] = None
        self._mapper: Optional[CoverageMapper] = None
        self._mitre_service: Optional[MITREService] = None
        
        # Initialize performance monitoring
        datadog.initialize()
        self.logger.info("Initialized CoverageService")

    def get_analyzer(self) -> CoverageAnalyzer:
        """
        Get or create thread-safe CoverageAnalyzer instance.

        Returns:
            CoverageAnalyzer: Configured analyzer instance
        """
        with self._instance_lock:
            if not self._analyzer:
                self._analyzer = CoverageAnalyzer(
                    db_session=self.db_session,
                    cache=self.cache,
                    cache_version=CACHE_VERSION,
                    config={'timeout': SERVICE_TIMEOUT}
                )
                self.logger.info("Created new CoverageAnalyzer instance")
                
            # Monitor analyzer health
            datadog.statsd.gauge(
                'coverage.analyzer.health',
                1 if self._analyzer else 0
            )
            
            return self._analyzer

    def get_mapper(self) -> CoverageMapper:
        """
        Get or create thread-safe CoverageMapper instance.

        Returns:
            CoverageMapper: Configured mapper instance
        """
        with self._instance_lock:
            if not self._mapper:
                self._mapper = CoverageMapper(
                    db_session=self.db_session,
                    cache=self.cache,
                    config={
                        'timeout': SERVICE_TIMEOUT,
                        'mitre_api_url': 'https://api.mitre.org/att&ck/v1'
                    }
                )
                self.logger.info("Created new CoverageMapper instance")
                
            # Monitor mapper health
            datadog.statsd.gauge(
                'coverage.mapper.health',
                1 if self._mapper else 0
            )
            
            return self._mapper

    def get_mitre_service(self) -> MITREService:
        """
        Get or create thread-safe MITREService instance.

        Returns:
            MITREService: Configured MITRE service instance
        """
        with self._instance_lock:
            if not self._mitre_service:
                self._mitre_service = MITREService(
                    cache=self.cache,
                    config={
                        'timeout': SERVICE_TIMEOUT,
                        'version': VERSION
                    }
                )
                self.logger.info("Created new MITREService instance")
                
            # Monitor MITRE service health
            datadog.statsd.gauge(
                'coverage.mitre.health',
                1 if self._mitre_service else 0
            )
            
            return self._mitre_service

    def health_check(self) -> Dict:
        """
        Perform comprehensive service health check.

        Returns:
            Dict: Health status of all components
        """
        health_status = {
            'status': 'healthy',
            'version': VERSION,
            'components': {
                'analyzer': False,
                'mapper': False,
                'mitre': False
            },
            'dependencies': {
                'database': False,
                'cache': False
            }
        }
        
        try:
            # Check database connection
            self.db_session.execute("SELECT 1")
            health_status['dependencies']['database'] = True
            
            # Check cache connection
            self.cache.ping()
            health_status['dependencies']['cache'] = True
            
            # Check component health
            health_status['components']['analyzer'] = bool(self._analyzer)
            health_status['components']['mapper'] = bool(self._mapper)
            health_status['components']['mitre'] = bool(self._mitre_service)
            
            # Update overall status
            if not all(health_status['dependencies'].values()):
                health_status['status'] = 'degraded'
            
            # Report metrics
            datadog.statsd.gauge('coverage.health', 1 if health_status['status'] == 'healthy' else 0)
            
        except Exception as e:
            health_status['status'] = 'unhealthy'
            health_status['error'] = str(e)
            self.logger.error(f"Health check failed: {str(e)}")
            datadog.statsd.gauge('coverage.health', 0)
            
        return health_status

    def shutdown(self) -> bool:
        """
        Gracefully shutdown service and cleanup resources.

        Returns:
            bool: Shutdown success status
        """
        try:
            with self._instance_lock:
                # Close database connections
                if self.db_session:
                    self.db_session.close()
                
                # Clear cache entries
                if self.cache:
                    self.cache.delete_pattern(f"{COVERAGE_PACKAGE_NAME}:*")
                
                # Reset component instances
                self._analyzer = None
                self._mapper = None
                self._mitre_service = None
                
                self.logger.info("Successfully shutdown CoverageService")
                return True
                
        except Exception as e:
            self.logger.error(f"Error during shutdown: {str(e)}")
            return False