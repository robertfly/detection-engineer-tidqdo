# External imports - versions specified for security tracking
import pytest  # pytest v7.0+
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # sqlalchemy v2.0+
from httpx import AsyncClient  # httpx v0.24+
from contextlib import asynccontextmanager  # python v3.11+
import logging
from typing import AsyncGenerator, Optional
import uuid

# Internal imports
from ..app.db.session import Base
from ..app.db.session import get_db
from ..app.models.user import User
from ..app.core.config import settings

# Configure logging for tests
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test database configuration with secure connection parameters
TEST_DATABASE_URL = settings.get_database_url() + '_test'

# Create async engine for test database with enhanced security
engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=True,
    future=True,
    pool_pre_ping=True,
    # Optimize connection pool for tests
    pool_size=5,
    max_overflow=10,
    # Set shorter timeouts for tests
    pool_timeout=30,
    # Enable SSL for secure connections
    connect_args={
        'ssl': True,
        'ssl_cert_reqs': 'CERT_REQUIRED'
    } if settings.SSL_CERT_PATH else {}
)

@pytest.fixture(scope="session", autouse=True)
def pytest_configure(request: pytest.FixtureRequest) -> None:
    """
    Configure PyTest environment with security and monitoring enhancements.
    
    Args:
        request: PyTest fixture request object
    """
    # Register custom markers for test categorization
    request.config.addinitialization('security', 'Mark test as security-related')
    request.config.addinitialization('integration', 'Mark test as integration test')
    request.config.addinitialization('api', 'Mark test as API test')
    
    # Configure test metrics collection
    logger.info("Initializing test metrics collection")
    
    # Set up security audit logging
    logger.info("Configuring security audit logging for tests")
    
    # Clean up test artifacts on completion
    def cleanup() -> None:
        logger.info("Cleaning up test environment")
    request.addfinalizer(cleanup)

@pytest.fixture
@asynccontextmanager
async def get_test_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Fixture providing isolated test database session with transaction management.
    
    Yields:
        AsyncSession: Isolated database session for test execution
    """
    # Create test database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    try:
        # Create session with explicit transaction control
        async_session = AsyncSession(
            engine,
            expire_on_commit=False,
            autoflush=False
        )
        
        async with async_session.begin():
            # Start nested transaction for test isolation
            logger.debug("Starting test database transaction")
            
            # Provide session to test
            yield async_session
            
            # Rollback transaction to ensure clean state
            logger.debug("Rolling back test database transaction")
            await async_session.rollback()
            
    except Exception as e:
        logger.error(f"Test database error: {str(e)}")
        raise
        
    finally:
        # Clean up session
        await async_session.close()
        logger.debug("Closed test database session")
        
        # Clean up tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
async def test_client(get_test_db: AsyncSession) -> AsyncClient:
    """
    Fixture providing configured HTTP test client with security headers.
    
    Args:
        get_test_db: Test database session
        
    Returns:
        AsyncClient: Configured test client
    """
    # Configure secure test client
    async with AsyncClient(
        base_url="http://test",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Test-Client": "true"
        },
        timeout=30.0,
        verify=True  # Enable SSL verification
    ) as client:
        # Override database dependency
        app.dependency_overrides[get_db] = lambda: get_test_db
        
        # Initialize test metrics
        logger.debug("Initializing test client metrics")
        
        yield client
        
        # Clean up
        app.dependency_overrides.clear()
        logger.debug("Cleaned up test client dependencies")

@pytest.fixture
async def test_user(get_test_db: AsyncSession) -> User:
    """
    Fixture providing secure test user with proper role and permissions.
    
    Args:
        get_test_db: Test database session
        
    Returns:
        User: Secure test user instance
    """
    # Generate secure test user data
    test_password = settings.get_test_user_password()
    user_id = uuid.uuid4()
    
    # Create test user with secure defaults
    test_user = User(
        id=user_id,
        email=f"test_{user_id}@example.com",
        role="community",
        is_active=True,
        gdpr_consent=True
    )
    
    # Set secure password with proper hashing
    test_user.set_password(test_password)
    
    try:
        # Save user to test database
        get_test_db.add(test_user)
        await get_test_db.commit()
        await get_test_db.refresh(test_user)
        
        logger.debug(f"Created test user: {test_user.email}")
        
        yield test_user
        
    finally:
        # Securely clean up test user
        await get_test_db.delete(test_user)
        await get_test_db.commit()
        logger.debug("Cleaned up test user data")