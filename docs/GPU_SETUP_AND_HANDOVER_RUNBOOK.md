# DocuFlow Automation / FlowApprove — Dedicated GPU Setup & Production Runbook
**Target Audience:** Infrastructure Engineers, DevOps, System Administrators, Successor Interns  
**Applies To:** Standalone Dedicated GPU Server / On-Premise AI Node (Ubuntu 22.04 LTS / Windows WSL2)  
**Document Version:** 2.1.0  
**Effective Date:** November 2026 (Handover Release)  

---

## 1. Executive Hardware & Architecture Summary

DocuFlow Automation executes a dual-tier AI processing pipeline:
1. **Computer Vision & OCR Layer:** Scans raw digital vector text and rasterized scanned PDF images using `pypdf` and `PaddleOCR`.
2. **Local Large Language Model (LLM) Layer:** Performs structured semantic extraction, table recognition, GSTIN parsing, and line-item formatting using local **Ollama** (`llama3.2:latest`).

### 1.1 Minimum & Recommended Hardware Specifications
| Component | Minimum Specification | Recommended Production Spec |
| :--- | :--- | :--- |
| **GPU Model** | NVIDIA RTX 3060 (12GB) / RTX 4060 Ti (16GB) | NVIDIA RTX 4090 (24GB) / A4000 / A5000 / L4 |
| **VRAM** | 12 GB Dedicated GDDR6 | 16 GB - 24 GB Dedicated VRAM |
| **System RAM** | 16 GB DDR4 | 32 GB - 64 GB DDR4/DDR5 |
| **CPU** | 6 Cores / 12 Threads (x86_64) | 8+ Cores / 16 Threads |
| **Storage** | 100 GB Free SSD | 500 GB NVMe SSD (for models, DB logs, and PDFs) |
| **Host OS** | Ubuntu 22.04 LTS (Recommended) | Ubuntu 22.04 LTS Server / Windows Server with WSL2 |

---

## 2. Step-by-Step GPU Host Setup (Bare-Metal to Running)

Follow these exact steps once the physical GPU server is delivered and booted.

### Step 2.1: Verify Hardware Detection
Open a terminal / PowerShell prompt and verify the PCIe card is detected:
```bash
# On Linux:
lspci | grep -i nvidia

# On Windows (PowerShell):
Get-PnpDevice -Class Display
```

### Step 2.2: Install NVIDIA Drivers & CUDA Toolkit
For Ubuntu 22.04 LTS:
```bash
# Update repository index
sudo apt update && sudo apt upgrade -y

# Install standard Linux kernel headers and build tools
sudo apt install -y build-essential dkms linux-headers-$(uname -r)

# Install recommended production NVIDIA driver (version 535 or 550)
sudo apt install -y nvidia-driver-550

# Reboot the machine to activate the driver
sudo reboot
```

After reboot, verify the driver and GPU are active:
```bash
nvidia-smi
```
*Expected Output:* You should see a table displaying Driver Version, CUDA Version (e.g., 12.2 or 12.4), GPU name, and 0MB memory usage.

### Step 2.3: Install NVIDIA Container Toolkit (For Docker GPU Passthrough)
If running services inside Docker, Docker must be able to pass GPU access directly to containers:
```bash
# Configure the NVIDIA Container Toolkit repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install the toolkit
sudo apt update
sudo apt install -y nvidia-container-toolkit

# Configure Docker daemon and restart
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Smoke Test: Verify GPU inside a test container
sudo docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi
```

---

## 3. Ollama (Local AI Engine) Setup on the GPU Host

DocuFlow communicates with Ollama over HTTP (`http://localhost:11434` or `http://host.docker.internal:11434`).

### Step 3.1: Install Ollama
```bash
# One-line official installer
curl -fsSL https://ollama.com/install.sh | sh
```

### Step 3.2: Enable External & Docker Access to Ollama
By default, Ollama only listens on `127.0.0.1`. When running backend in Docker, Ollama must listen on `0.0.0.0` or allow container networking:
```bash
# Edit Ollama systemd service environment
sudo systemctl edit ollama.service
```
Add the following lines under the blank override section:
```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=2"
```
Save and restart Ollama:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### Step 3.3: Pull & Cache the Primary AI Model
Download the production model onto the GPU server:
```bash
# Primary production model (High accuracy, fast structured JSON, ~2.0 GB VRAM)
ollama pull llama3.2:latest

# Verify model loaded on GPU
ollama run llama3.2:latest "Hello, confirm you are running on GPU"
```
While this runs, open a second terminal and execute `nvidia-smi`. You should see `ollama_llama_server` consuming ~2.2 GB of VRAM.

---

## 4. Configuring DocuFlow for the GPU Environment

### 4.1 Update `.env` File
In the project root directory, adjust the `.env` settings to enable the local GPU AI extraction:
```env
# ==============================================================================
# GPU & AI INFERENCE CONFIGURATION
# ==============================================================================
# URL of the local GPU-accelerated Ollama daemon
OLLAMA_URL=http://host.docker.internal:11434/api/generate

# Selected Model (Must match model pulled in Ollama)
OLLAMA_MODEL=llama3.2:latest

# Maximum timeout in seconds for high-density multi-page invoices
OLLAMA_TIMEOUT=45.0

# Maximum simultaneous OCR & LLM extraction jobs (protects VRAM)
# Recommended: 2 for 12GB-16GB GPUs, 4 for 24GB GPUs
MAX_CONCURRENT_OCR=2
OCR_SEMAPHORE_TIMEOUT=60.0

# Path configuration
PDF_STORAGE_PATH=/app/stored_pdfs
APPROVED_PDF_PATH=/app/stored_pdfs/approved
```

### 4.2 Updating `docker-compose.yml` for GPU Acceleration (Optional / If Containerized)
If you package PaddleOCR or Ollama directly inside Docker, enable GPU reservation in `docker-compose.yml`:
```yaml
services:
  backend:
    # ... existing backend configuration ...
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

---

## 5. Launch & Verification Procedure

### Step 5.1: Launch Containers
```bash
# Stop any old instances
docker compose down

# Build and start in background
docker compose up -d --build
```

### Step 5.2: Verification Smoke Tests
1. **Health Check:**
   ```bash
   curl http://localhost:3000/api/health
   # Expected: {"status": "ok", "database": "connected"}
   ```

2. **Ollama Connection Check:**
   ```bash
   docker exec -it docuflow-backend python -c "
   import httpx
   r = httpx.get('http://host.docker.internal:11434/api/tags')
   print('Ollama Status:', r.status_code, r.json())
   "
   ```

3. **End-to-End Extraction Smoke Test:**
   Upload a sample PDF via the UI (`http://<SERVER_IP>:8085/upload`) and inspect `docker compose logs -f backend`. Look for the log line:
   ```text
   [Ollama Extraction] Successfully extracted fields using llama3.2:latest (Invoice: INV-2026-001, Items: 4, Total: 15420.00)
   ```

---

## 6. Day-to-Day Operations & Maintenance (Runbook)

### 6.1 Common Operational Commands
| Task | Command |
| :--- | :--- |
| **Check GPU status & VRAM** | `nvidia-smi` |
| **Live GPU monitor** | `watch -n 1 nvidia-smi` |
| **View Backend logs** | `docker compose logs -f backend` |
| **Restart Application** | `docker compose restart` |
| **Restart Ollama AI Engine** | `sudo systemctl restart ollama` |
| **Stop All Services** | `docker compose down` |

### 6.2 Managing GPU Memory & Preventing CUDA OOM
If the server encounters `CUDA Out of Memory` during spikes in document uploads:
1. **Adjust Semaphore:** Lower `MAX_CONCURRENT_OCR` from `3` to `2` in `.env`. This forces concurrent uploads to queue gracefully rather than crashing the GPU.
2. **Clear Ollama Inactive Cache:** By default, `OLLAMA_KEEP_ALIVE=24h` keeps the model warm. To unload models when idle, set `OLLAMA_KEEP_ALIVE=5m`.
3. **Purge Temp Images:** Ensure cached crops in `uploads/` older than 7 days are cleaned using the in-app `AdminSystem` maintenance button or a weekly cron job:
   ```bash
   find /path/to/docuflow-automation/backend/uploads -type f -mtime +7 -delete
   ```

---

## 7. Troubleshooting Guide (Top 5 GPU Issues)

### 1. `docker: Error response from daemon: could not select device driver with capabilities: [[gpu]]`
- **Cause:** NVIDIA Container Toolkit is not installed or Docker daemon was not restarted.
- **Fix:** Run `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`.

### 2. `[Ollama Extraction] Local Ollama call skipped/failed: ConnectError`
- **Cause:** Backend inside Docker cannot resolve `host.docker.internal:11434`, or Ollama is listening only on `127.0.0.1`.
- **Fix:** Verify `extra_hosts: ["host.docker.internal:host-gateway"]` is present in `docker-compose.yml`, and ensure `Environment="OLLAMA_HOST=0.0.0.0:11434"` is set in `ollama.service`.

### 3. High CPU Usage Instead of GPU
- **Cause:** Ollama was started before the NVIDIA driver finished initializing, falling back to CPU AVX instructions.
- **Fix:** Restart Ollama with `sudo systemctl restart ollama` and check `systemctl status ollama` to verify GPU offloading (`layer offloaded to GPU: 100%`).

### 4. GPU Temperature Throttling
- **Cause:** Server fans blocked or improper ventilation in the server rack.
- **Fix:** Check temperature with `nvidia-smi --query-gpu=temperature.gpu --format=csv`. If temperature exceeds 84°C, inspect physical chassis airflow.

### 5. PDF Upload Sits on "Extracting..." Indefinitely
- **Cause:** Corrupt multi-page PDF causing OCR infinite loop or thread starvation.
- **Fix:** The `OCRConcurrencyError` semaphore will auto-release after 60 seconds (`OCR_SEMAPHORE_TIMEOUT`). The backend automatically falls back to regex rules if the LLM does not reply within 45 seconds. Check logs with `docker compose logs --tail=100 backend`.

---

*End of GPU Setup & Production Runbook.*
