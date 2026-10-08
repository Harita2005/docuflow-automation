import os
import uvicorn
from pathlib import Path
from app.config.settings import settings

BASE_DIR = Path(__file__).resolve().parent

if __name__ == '__main__':
    env = (settings.ENVIRONMENT or os.getenv("ENVIRONMENT", "development")).strip().lower()
    is_non_prod = env in ("development", "dev", "local", "test", "testing")

    explicit_reload = os.getenv("UVICORN_RELOAD")
    if explicit_reload is not None:
        reload_enabled = explicit_reload.strip().lower() in ("1", "true", "yes")
    else:
        reload_enabled = is_non_prod

    uvicorn_kwargs = {
        "host": "0.0.0.0",
        "port": 3000,
        "reload": reload_enabled,
    }
    if reload_enabled:
        uvicorn_kwargs["reload_dirs"] = [str(BASE_DIR / "app")]
        uvicorn_kwargs["reload_includes"] = ["*.py"]
        uvicorn_kwargs["reload_excludes"] = ["*.pyc", "__pycache__", "*.db", "uploads/*"]

    uvicorn.run("app.main:app", **uvicorn_kwargs)