# PART 12: Deployment and Infrastructure

## 12.1 Deployment Topology & Hosting Model

DocuFlow is packaged for deployment using Docker containerization orchestrated via Docker Compose or Kubernetes ingress.

```
                           +----------------------------------------+
                           |  Corporate Gateway / Ingress / ALB     |
                           |  (SSL Termination HTTPS Port 443)      |
                           +----------------------------------------+
                                       |              |
                    Port 80 / 8085     |              | Port 3000 (M2M Direct)
                                       v              v
+----------------------------------------+          +----------------------------------------+
| FRONTEND CONTAINER (docuflow-frontend) |          | BACKEND CONTAINER (docuflow-backend)   |
| - Nginx Alpine Web Server              |          | - Python 3.11-slim (Uvicorn / FastAPI) |
| - Static React Assets (dist/)          |          | - Non-root user: appuser (UID 10001)   |
| - Proxies /api/ to backend:3000        |--------->| - Healthcheck: /api/health (30s loop)  |
+----------------------------------------+          +----------------------------------------+
                                                                |
                                                                | ODBC Driver 17 (TLS Port 1443)
                                                                v
                                                    +----------------------------------------+
                                                    | DATABASE SERVER (DocuFlowDB)           |
                                                    | Microsoft SQL Server 192.168.179.22    |
                                                    +----------------------------------------+
```

---

## 12.2 Container Configurations

### 1. Backend Container ([`backend/Dockerfile`](file:///backend/Dockerfile))
- **Base Image**: `python:3.11-slim-bookworm`
- **System Dependencies**: `curl`, `gnupg2`, `unixodbc`, `unixodbc-dev`, `libgl1`, `libglib2.0-0`, `msodbcsql17`.
- **Security Hardening**:
  - Drops root privileges: runs under dedicated user `appuser` (UID 10001, group `appgroup`).
  - Strict filesystem ownership on `/app/uploads` and `/app/stored_pdfs`.
- **Healthcheck**: Periodically probes `http://localhost:3000/api/health` every 30 seconds.
- **Port**: Exposes `3000`.

### 2. Frontend Container ([`frontend/Dockerfile`](file:///frontend/Dockerfile))
- **Multi-Stage Build**:
  - **Stage 1 (Builder)**: `node:20-alpine` runs `npm install` and `npm run build`.
  - **Stage 2 (Server)**: `nginx:alpine` copies built distribution files to `/usr/share/nginx/html`.
- **Nginx Configuration** ([`frontend/nginx.conf`](file:///frontend/nginx.conf)):
  - Handles client-side React routing via `try_files $uri $uri/ /index.html;`.
  - Explicitly registers `.mjs` MIME types for `pdf.js` worker threads.
  - Reverse proxies `/api/`, `/uploads/`, `/stored_pdfs/`, and `/socket.io/` directly to `http://backend:3000`.

---

## 12.3 Docker Compose Orchestration ([`docker-compose.yml`](file:///docker-compose.yml))

| Service | Container Name | Host Port | Internal Port | Persistent Volumes | Restart Policy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `backend` | `docuflow-backend` | `3000` | `3000` | `./backend/uploads:/app/uploads`<br>`./stored_pdfs:/app/stored_pdfs` | `unless-stopped` |
| `frontend` | `docuflow-frontend` | `8085` | `80` | None (stateless) | `unless-stopped` |

---

## 12.4 CI/CD Pipeline Analysis ([`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml))

The repository uses GitHub Actions for continuous integration:

- **Trigger Conditions**: Push or Pull Request against the `main` branch.
- **Runner Environment**: `ubuntu-latest`.
- **Pipeline Stages**:
  1. **Checkout**: Uses `actions/checkout@v4`.
  2. **Python Setup**: Uses `actions/setup-python@v5` with Python `3.11` and pip caching.
  3. **ODBC System Setup**: Runs `sudo apt-get install -y unixodbc unixodbc-dev` to enable compilation of `pyodbc`.
  4. **Backend Dependencies**: Installs and validates dependencies via `pip install -r backend/requirements.txt`.
  5. **Node.js Setup**: Uses `actions/setup-node@v4` with Node `20` and npm caching.
  6. **Frontend Build**: Executes `npm install --legacy-peer-deps` followed by `npm run build` to verify TypeScript compile integrity and asset minification.

---

## 12.5 Production Network Ports & Security Boundaries

| Port | Protocol | Source | Destination | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `80` / `443` | TCP (HTTP/HTTPS) | Public / Corporate LAN | Ingress / Nginx | User browser interface |
| `8085` | TCP (HTTP) | Host / Load Balancer | Frontend Container | Local container port mapping |
| `3000` | TCP (HTTP) | Nginx / ERP Direct | Backend Container | REST API and M2M inbound ingestion |
| `1443` | TCP (TDS/TLS) | Backend Container | Database Server (`192.168.179.22`) | Encrypted MS SQL Server database connection |
| `587` | TCP (STARTTLS) | Backend Container | Corporate SMTP Server | Outbound transactional OTPs and email notifications |

---

**Verified against source**: [`docker-compose.yml`](file:///docker-compose.yml), [`backend/Dockerfile`](file:///backend/Dockerfile), [`frontend/Dockerfile`](file:///frontend/Dockerfile), [`frontend/nginx.conf`](file:///frontend/nginx.conf), [`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml).

