# Stage 1: Builder
FROM node:18-alpine AS builder

# Set build arguments
ARG NODE_ENV=production
ARG VITE_API_BASE_URL
ARG VITE_WS_BASE_URL
ARG BUILD_VERSION

# Set environment variables
ENV NODE_ENV=${NODE_ENV} \
    VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_WS_BASE_URL=${VITE_WS_BASE_URL} \
    VITE_APP_VERSION=${BUILD_VERSION}

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    git=~2.40 \
    python3=~3.11 \
    build-base=~0.5 \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy source code and configuration
COPY . .

# Run lint and type checks
RUN npm run lint && npm run typecheck

# Build application
RUN npm run build

# Clean up development dependencies
RUN npm prune --production

# Stage 2: Production
FROM nginx:1.25-alpine

# Set environment variables
ENV TZ=UTC \
    NGINX_USER=nginx

# Create nginx user and set permissions
RUN addgroup -g 101 -S nginx \
    && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx nginx \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx

# Install required packages
RUN apk add --no-cache \
    curl=~8.4 \
    tzdata=~2023c \
    && rm -rf /var/cache/apk/*

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Create required directories
RUN mkdir -p /etc/nginx/ssl \
    /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/ssl \
    && chown -R nginx:nginx /var/log/nginx \
    && chmod -R 750 /etc/nginx/ssl \
    && chmod -R 750 /var/log/nginx

# Validate nginx configuration
RUN nginx -t

# Set up security headers
RUN echo 'add_header X-Frame-Options "SAMEORIGIN";' > /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header X-Content-Type-Options "nosniff";' >> /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header X-XSS-Protection "1; mode=block";' >> /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header Referrer-Policy "strict-origin-when-cross-origin";' >> /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\'' '\''unsafe-inline'\'' '\''unsafe-eval'\''; style-src '\''self'\'' '\''unsafe-inline'\''; img-src '\''self'\'' data: https:; font-src '\''self'\'' data:; connect-src '\''self'\'' ${VITE_API_BASE_URL} ${VITE_WS_BASE_URL};";' >> /etc/nginx/conf.d/security-headers.conf

# Configure health check endpoint
RUN echo 'location /health { \
    access_log off; \
    add_header Content-Type text/plain; \
    return 200 "healthy\n"; \
}' > /etc/nginx/conf.d/health.conf

# Expose ports
EXPOSE 80 443

# Set up volumes
VOLUME ["/etc/nginx/conf.d", "/var/log/nginx", "/etc/nginx/ssl"]

# Switch to non-root user
USER nginx

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:80/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]