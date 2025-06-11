#!/bin/bash
set -e

# Docker entrypoint script for C Programming Platform
echo "🐳 Starting C Programming Practice Platform in Docker..."

# Ensure directories exist with proper permissions
mkdir -p /app/temp /app/logs /app/data
chmod 755 /app/temp /app/logs /app/data

# Set proper ulimits for security
ulimit -t 30          # CPU time limit (30 seconds)
ulimit -v 104857600   # Virtual memory limit (100MB)
ulimit -u 50          # Process limit
ulimit -f 10240       # File size limit (10MB)

# Clean up any existing temp files older than 1 hour
find /app/temp -type f -mmin +60 -delete 2>/dev/null || true

# Log startup info
echo "📁 Working directory: $(pwd)"
echo "👤 Running as user: $(whoami)"
echo "🔧 Python version: $(python --version)"
echo "🐳 Container environment: $(uname -a)"

# Start the application
echo "🚀 Starting Flask-SocketIO server..."
exec python app.py
