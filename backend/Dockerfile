FROM node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Install Python 3, pip, and system dependencies required for OpenCV / PaddleOCR
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create a Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy python requirements and install them
COPY requirements.txt .
# Install requirements + paddleocr (which is imported in local_ocr.py)
RUN pip install --no-cache-dir -r requirements.txt paddlepaddle==2.6.1 paddleocr==2.7.3

# Copy Node.js package files
COPY package.json ./

# Install Node.js dependencies
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Expose backend port
EXPOSE 3000

# Start command: Auto-create tables in SQL Server, seed data, then launch Node
CMD ["sh", "-c", "npx prisma db push && node load_seed.cjs && npm run start"]
