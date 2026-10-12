FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies for MS SQL ODBC / pymssql and OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    build-essential \
    gcc \
    g++ \
    libgl1 \
    libglib2.0-0 \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl -fsSL https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 msodbcsql17 || true \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create non-root group and user with dedicated permissions
RUN groupadd -r appgroup && useradd -r -u 10001 -g appgroup appuser \
    && mkdir -p /app/uploads /app/stored_pdfs/approved /app/data \
    && chown -R appuser:appgroup /app

# Copy backend source code
COPY --chown=appuser:appgroup . .

# Switch to non-root user
USER appuser

# Expose backend port
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start FastAPI server
CMD ["python", "run.py"]
