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
    dos2unix \
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

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV FLASK_ENV=production

# Create entrypoint script inline (avoids line ending issues)
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🐳 Starting C Programming Practice Platform..."\n\
\n\
# Ensure directories exist with proper permissions\n\
mkdir -p /app/temp /app/logs /app/data\n\
chmod 755 /app/temp /app/logs /app/data\n\
\n\
# Set proper ulimits for security\n\
ulimit -t 30 2>/dev/null || echo "⚠️  Could not set CPU time limit"\n\
ulimit -v 104857600 2>/dev/null || echo "⚠️  Could not set memory limit"\n\
ulimit -u 50 2>/dev/null || echo "⚠️  Could not set process limit"\n\
ulimit -f 10240 2>/dev/null || echo "⚠️  Could not set file size limit"\n\
\n\
# Clean up any existing temp files older than 1 hour\n\
find /app/temp -type f -mmin +60 -delete 2>/dev/null || true\n\
\n\
# Log startup info\n\
echo "📁 Working directory: $(pwd)"\n\
echo "👤 Running as user: $(whoami)"\n\
echo "🔧 Python version: $(python --version)"\n\
echo "🏗️  GCC version: $(gcc --version | head -n1)"\n\
\n\
# Check if app.py exists\n\
if [ ! -f "/app/app.py" ]; then\n\
    echo "❌ Error: app.py not found in /app directory"\n\
    echo "📂 Current directory contents:"\n\
    ls -la /app/\n\
    exit 1\n\
fi\n\
\n\
echo "🚀 Starting Flask-SocketIO server..."\n\
exec python app.py' > /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    chown appuser:appuser /entrypoint.sh

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/game/status || exit 1

# Use the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]