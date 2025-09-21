# Dank Agent Base Image
# This is the base Docker image that all agents will extend

FROM node:22-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    wget \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Create agent code drop-off directory
RUN mkdir -p /app/agent-code

# Install global npm packages that agents might need
RUN npm install -g \
    axios \
    lodash \
    moment \
    uuid

# Copy agent entrypoint
COPY entrypoint.js /app/entrypoint.js

# Make entrypoint executable
RUN chmod +x /app/entrypoint.js

# Install runtime dependencies
COPY package.json /app/package.json
RUN npm install --production

# Create non-root user for security
RUN addgroup -g 1001 -S dankuser && \
    adduser -S dankuser -u 1001 -G dankuser

# Set ownership
RUN chown -R dankuser:dankuser /app

# Switch to non-root user
USER dankuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Expose port for health checks and communication
EXPOSE 3001

# Default entrypoint
ENTRYPOINT ["node", "/app/entrypoint.js"]
