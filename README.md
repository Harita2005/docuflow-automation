# 🚀 Docuflow Automation

<p align="center">
  <strong>An Enterprise-Grade, AI-Powered Intelligent Document Processing & Workflow Engine</strong>
</p>

Docuflow Automation is a full-stack, state-of-the-art platform designed to completely automate document-heavy workflows. By combining a beautiful modern UI with local, privacy-first Large Language Models (LLMs), Docuflow extracts critical data from unstructured documents and routes them through custom, visual business logic—all without your sensitive data ever leaving your infrastructure.

## ✨ Why Docuflow?

* 🔒 **100% Data Privacy (On-Prem AI):** Powered by local LLMs via Ollama, ensuring compliance with strict data privacy regulations (GDPR, HIPAA). No API keys, no data sharing.
* 🧠 **Zero-Shot AI Extraction:** Say goodbye to brittle OCR templates. Our Python-based extraction engine uses Llama-3.2 to intelligently understand and extract data from unstructured PDFs and images.
* ⚡ **Visual Workflow Builder:** A powerful drag-and-drop interface (built on React Flow) to construct complex, conditional routing and approval chains without writing a single line of code.
* 📊 **Real-Time Analytics:** Live dashboard with instant WebSocket (Socket.io) updates, giving you a bird's-eye view of your organization's entire operational pipeline.
* 🚀 **Modern Tech Stack:** Built for performance and scale using React 19, Node.js, Prisma, and a sleek Tailwind CSS / Material UI design system.

## 🛠️ Architecture & Tech Stack

**Frontend:** React 19, Vite, TailwindCSS v4, Material UI, React Flow, Zustand, Recharts, Framer Motion  
**Backend:** Node.js, Express, Prisma (ORM), Socket.io, JWT Authentication  
**AI & Processing:** Python, Local LLM (Ollama - Llama 3.2 / 3.1:8b)

---

## 🚀 Getting Started

This repository contains both the React frontend and the Node.js/Python backend. Because the database file (`dev.db`) is included, you do not need to run any seeding scripts—it will work perfectly with all test users, templates, and rules pre-configured right out of the box!

### Prerequisites
- Node.js (v18+)
- Python 3.9+
- Git
- **Ollama** (Required for the local AI Extraction Engine. You must have Ollama installed and running `llama3.2` or `llama3.1:8b` locally).

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
Since the database is pre-populated, you can log in immediately to explore the platform:
- **Username:** `admin@initech.com`
- **Password:** `password123`
