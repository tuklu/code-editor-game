FROM python:3.12-slim

# Install system dependencies for C compilation and PTY support
RUN apt-get update && apt-get install -y \
    gcc \
    libc6-dev \
    make \
    binutils \
    gdb \
    strace \
    procps \
    util-linux \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the entire app directory
COPY app/ ./

# Create necessary directories and set permissions
RUN mkdir -p /app/temp /app/logs /app/data && \
    chown -R appuser:appuser /app

# Set environment variables for better container behavior
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV FLASK_ENV=production
ENV C_FORCE_ROOT=1

# Create a startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && \
    chown appuser:appuser /docker-entrypoint.sh

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/game/status || exit 1

# Use the entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]