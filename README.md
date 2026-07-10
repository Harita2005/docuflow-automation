# Docuflow Automation

A full-stack intelligent document processing and workflow automation system. 

## 🚀 Getting Started

This repository contains both the React frontend and the Node.js/Python backend. Because the database file (`dev.db`) is included in the repository, you do not need to run any seeding scripts—it will work perfectly with all test users, templates, and rules pre-configured right out of the box!

### Prerequisites
- Node.js (v18+)
- Python 3.9+
- Git
- **Ollama** (Required for the local AI Extraction Engine to run without API keys. You must have Ollama installed and running `llama3.2` or `llama3.1:8b` locally).

### 1. Backend Setup (Server & AI Extractor)

Open a terminal and navigate to the `backend` folder:
```bash
cd backend
```

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Set up Python for Local AI OCR:**
   ```bash
   python -m venv venv
   # Activate the virtual environment:
   # On Windows:
   venv\Scripts\activate
   # On Mac/Linux:
   source venv/bin/activate
   
   pip install -r requirements.txt
   ```
3. **Environment Variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
4. **Start the backend server:**
   ```bash
   npm start
   ```
   *The server will start on port 3000.*

---

### 2. Frontend Setup (React UI)

Open a **new** terminal and navigate to the `frontend` folder:
```bash
cd frontend
```

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Start the development server:**
   ```bash
   npm run dev
   ```
   *The UI will run on port 5173 (usually http://localhost:5173).*

### 🔐 Default Login Credentials
Since the database is pre-populated, you can log in immediately:
- **Username:** `admin@initech.com`
- **Password:** `password123`
