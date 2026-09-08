# Production Dockerfile for DAAS (Document Approval Automation System)
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_VERSION=18.x

# Install system dependencies & Node.js for frontend building
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    libpq-dev \
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

# Copy application source code
COPY . .

# Build production frontend assets
RUN npm run build -w frontend

# Expose backend API port
EXPOSE 3000

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/stats || exit 1

# Start Uvicorn production server
CMD ["python", "backend/run.py"]
