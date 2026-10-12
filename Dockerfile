# Production Dockerfile for DAAS (Document Approval Automation System)
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_VERSION=18.x

# Install system dependencies & Node.js for frontend building
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    build-essential \
    unixodbc \
    unixodbc-dev \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root & backend requirements
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy frontend package.json & install dependencies
COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
RUN npm install

# Create non-root app user
RUN groupadd -r appgroup && useradd -r -u 10001 -g appgroup appuser \
    && mkdir -p /app/backend/uploads /app/stored_pdfs/approved /app/backend/data \
    && chown -R appuser:appgroup /app

# Copy application source code
COPY --chown=appuser:appgroup . .

# Build production frontend assets
RUN npm run build -w frontend

# Switch to non-root user
USER appuser

# Expose backend API port
EXPOSE 3000

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start Uvicorn production server
CMD ["python", "backend/run.py"]
