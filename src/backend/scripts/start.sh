#!/bin/bash

# Production-grade startup script for FastAPI backend application
# Version: 1.0.0

set -e  # Exit on error
set -u  # Exit on undefined variables

# Default environment variables with secure defaults
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
WORKERS="${WORKERS:-$(nproc)}"
WORKER_CLASS="${WORKER_CLASS:-uvicorn.workers.UvicornWorker}"
TIMEOUT="${TIMEOUT:-120}"
KEEP_ALIVE="${KEEP_ALIVE:-65}"
MAX_REQUESTS="${MAX_REQUESTS:-1000}"
MAX_REQUESTS_JITTER="${MAX_REQUESTS_JITTER:-50}"
GRACEFUL_TIMEOUT="${GRACEFUL_TIMEOUT:-30}"
LOG_LEVEL="${LOG_LEVEL:-info}"
SSL_KEYFILE="${SSL_KEYFILE:-/etc/ssl/private/server.key}"
SSL_CERTFILE="${SSL_CERTFILE:-/etc/ssl/certs/server.crt}"

# Function to check environment and dependencies
check_environment() {
    echo "Performing environment validation..."

    # Check Python version
    python_version=$(python3 --version 2>&1 | awk '{print $2}')
    if [[ ! "$python_version" =~ ^3\.[89]|^3\.1[0-9] ]]; then
        echo "Error: Python 3.8 or higher required, found $python_version"
        return 1
    fi

    # Verify required environment variables
    required_vars=("POSTGRES_DB" "POSTGRES_USER" "POSTGRES_PASSWORD" "REDIS_HOST" "SECRET_KEY")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            echo "Error: Required environment variable $var is not set"
            return 1
        fi
    done

    # Check SSL certificates if HTTPS enabled
    if [[ -n "${SSL_ENABLED:-}" ]]; then
        if [[ ! -f "$SSL_KEYFILE" ]] || [[ ! -f "$SSL_CERTFILE" ]]; then
            echo "Error: SSL certificates not found"
            return 1
        fi
        # Verify certificate permissions
        if [[ "$(stat -c %a "$SSL_KEYFILE")" != "600" ]]; then
            echo "Error: SSL key file has incorrect permissions. Setting to 600..."
            chmod 600 "$SSL_KEYFILE"
        fi
    fi

    # Check disk space
    available_space=$(df -P . | awk 'NR==2 {print $4}')
    if [[ "$available_space" -lt 5242880 ]]; then  # 5GB in KB
        echo "Error: Insufficient disk space"
        return 1
    fi

    # Verify database connection
    if ! python3 -c "
from app.db.session import get_db
next(get_db()).execute('SELECT 1')
    "; then
        echo "Error: Database connection failed"
        return 1
    fi

    # Verify Redis connection
    if ! redis-cli -h "$REDIS_HOST" ping > /dev/null; then
        echo "Error: Redis connection failed"
        return 1
    fi

    # Check log directory permissions
    LOG_DIR="logs"
    if [[ ! -d "$LOG_DIR" ]]; then
        mkdir -p "$LOG_DIR"
    fi
    chmod 755 "$LOG_DIR"

    echo "Environment validation completed successfully"
    return 0
}

# Function to configure monitoring and logging
configure_monitoring() {
    echo "Configuring monitoring and observability..."

    # Initialize Prometheus metrics directory
    METRICS_DIR="/tmp/metrics"
    mkdir -p "$METRICS_DIR"
    chmod 755 "$METRICS_DIR"

    # Configure log rotation
    cat > /etc/logrotate.d/fastapi << EOF
/var/log/fastapi/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload fastapi > /dev/null 2>&1 || true
    endscript
}
EOF

    # Initialize health check endpoint
    mkdir -p /health
    cat > /health/live << EOF
#!/bin/sh
curl -sf http://localhost:${PORT}/health || exit 1
EOF
    chmod +x /health/live

    echo "Monitoring configuration completed"
}

# Function to start the application
start_server() {
    echo "Starting FastAPI application..."

    # Validate environment first
    if ! check_environment; then
        echo "Environment validation failed"
        exit 1
    fi

    # Configure monitoring
    configure_monitoring

    # Set Gunicorn config
    GUNICORN_CONF="
import multiprocessing
import os

workers = ${WORKERS}
worker_class = '${WORKER_CLASS}'
bind = '${HOST}:${PORT}'
timeout = ${TIMEOUT}
keepalive = ${KEEP_ALIVE}
max_requests = ${MAX_REQUESTS}
max_requests_jitter = ${MAX_REQUESTS_JITTER}
graceful_timeout = ${GRACEFUL_TIMEOUT}
accesslog = '-'
errorlog = '-'
loglevel = '${LOG_LEVEL}'

# Security settings
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# SSL configuration
if os.path.exists('${SSL_KEYFILE}') and os.path.exists('${SSL_CERTFILE}'):
    keyfile = '${SSL_KEYFILE}'
    certfile = '${SSL_CERTFILE}'
    ssl_version = 5  # TLS 1.2

# Worker configuration
worker_tmp_dir = '/dev/shm'
worker_connections = 1000
worker_exit_on_graceful_dealloc = True

# Logging configuration
logconfig_dict = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            'format': '%(asctime)s %(name)s %(levelname)s %(message)s',
            'class': 'pythonjsonlogger.jsonlogger.JsonFormatter'
        }
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json'
        }
    },
    'root': {
        'handlers': ['console'],
        'level': '${LOG_LEVEL}'
    }
}
"

    # Write Gunicorn config
    echo "$GUNICORN_CONF" > gunicorn.conf.py

    # Start application with Gunicorn
    exec gunicorn "app.main:app" \
        --config gunicorn.conf.py \
        --preload \
        --statsd-host=localhost:8125 \
        --worker-tmp-dir /dev/shm \
        --capture-output \
        --enable-stdio-inheritance
}

# Start the application
start_server