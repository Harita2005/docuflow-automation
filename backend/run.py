import uvicorn
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=3000,
        reload=True,
        reload_dirs=[str(BASE_DIR / "app")],
        reload_includes=["*.py"],
        reload_excludes=["*.pyc", "__pycache__", "*.db", "uploads/*"]
    )
