import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import User, WorkflowProfile
from app.routers import auth, users, invoices, workflows, conditions, audit, sync

# Initialize database schema tables on import
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"[Database] Warning on table creation: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.on_event("startup")
def startup_event():
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        user_count = db.query(User).count()
        wf_count = db.query(WorkflowProfile).count()
        if user_count < 10 or wf_count == 0:
            print(f"[Startup] Seeding complete dataset (Found {user_count} users, {wf_count} workflows)...")
            from seed_excel import seed_database
            seed_database()
        db.close()
    except Exception as e:
        print(f"[Startup] Notice during startup seed: {e}")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory for PDF documents and attachments
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

# Include API Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(users.admin_router)
app.include_router(invoices.router)
app.include_router(workflows.router)
app.include_router(conditions.router)
app.include_router(audit.router)
app.include_router(sync.router)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": "MS SQL Server" if not settings.DATABASE_URL.startswith("sqlite") else "SQLite (Local)",
        "docs": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
