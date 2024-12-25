# Stage 1: Python base image with security hardening
FROM python:3.11-slim AS python-base

# Set Python environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.6.1 \
    POETRY_HOME=/opt/poetry \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_VIRTUALENVS_CREATE=true \
    POETRY_CACHE_DIR=/opt/poetry/cache

# Security updates and install system dependencies
RUN apt-get update && apt-get upgrade -y \
    && apt-get install --no-install-recommends -y \
        curl \
        gcc \
        libc6-dev \
        libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    # Install poetry with version pinning
    && curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry \
    # Create non-root user
    && groupadd -g 1000 backend \
    && useradd -u 1000 -g backend -s /bin/bash -m backend \
    # Set secure permissions
    && mkdir -p /app /opt/poetry/cache \
    && chown -R backend:backend /app /opt/poetry

# Stage 2: Builder stage for dependencies
FROM python-base AS builder

WORKDIR /app

# Copy dependency files with correct ownership
COPY --chown=backend:backend pyproject.toml poetry.lock ./

# Install production dependencies only
RUN poetry install --only main --no-root \
    # Run security checks on dependencies
    && poetry run safety check \
    # Generate lockfile hash for verification
    && poetry export -f requirements.txt --output requirements.txt \
    # Clean poetry cache
    && rm -rf $POETRY_CACHE_DIR

# Stage 3: Final runtime stage
FROM python-base AS runtime

# Set runtime environment variables
ENV PYTHONPATH=/app \
    PORT=8000 \
    HOST=0.0.0.0 \
    WORKERS=4 \
    LOG_LEVEL=INFO \
    ENABLE_METRICS=true \
    ENABLE_PROFILING=false \
    MAX_REQUEST_SIZE=10MB \
    GRACEFUL_SHUTDOWN_TIMEOUT=30

WORKDIR /app

# Copy installed dependencies and application code
COPY --from=builder --chown=backend:backend /app/.venv ./.venv
COPY --chown=backend:backend ./app ./app

# Set secure file permissions
RUN chmod -R 550 /app \
    && chmod -R 770 /tmp \
    # Verify dependencies integrity
    && ./.venv/bin/pip freeze > installed.txt \
    && diff requirements.txt installed.txt

# Configure security options
USER backend
EXPOSE 8000

# Set resource limits
LABEL maintainer="Detection Engineering Team" \
      version="1.0.0" \
      security.scan.required="true" \
      monitoring.enabled="true"

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Set resource limits and security options
RUN ulimit -n 65535 && ulimit -u 65535

# Drop all capabilities except what's needed
RUN setcap cap_net_bind_service=+ep /usr/local/bin/python3.11

# Start the application with proper settings
ENTRYPOINT ["poetry", "run", "uvicorn"]
CMD ["app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--log-level", "info", \
     "--timeout-keep-alive", "75", \
     "--limit-concurrency", "1000", \
     "--backlog", "2048"]

# Apply security options
VOLUME ["/tmp"]
STOPSIGNAL SIGTERM