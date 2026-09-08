FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies for MS SQL ODBC / pymssql and OCR
RUN apt-get update && apt-get install -y \
    curl \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    libgl1 \
    libglib2.0-0 \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl -fsSL https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql17 || true \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create storage directories inside Docker container for storing approved files
RUN mkdir -p /app/uploads /app/stored_pdfs/approved

# Copy backend source code
COPY . .

# Expose backend port
EXPOSE 3000

# Start FastAPI server
CMD ["python", "run.py"]
