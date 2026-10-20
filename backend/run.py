import os
import uvicorn
from pathlib import Path
from app.config.settings import settings

BASE_DIR = Path(__file__).resolve().parent

def free_port_if_occupied(port: int = 3000):
    """Checks if the port is held by an orphan process and terminates it to prevent WinError 10013 / WSAEACCES."""
    try:
        import subprocess
        output = subprocess.check_output(
            f'netstat -ano | findstr :{port}',
            shell=True,
            text=True,
            stderr=subprocess.DEVNULL
        )
        my_pid = os.getpid()
        for line in output.strip().splitlines():
            if 'LISTENING' in line:
                parts = line.strip().split()
                pid = int(parts[-1])
                if pid and pid != my_pid:
                    print(f"[DocuFlow Startup] Port {port} occupied by previous process PID {pid}. Releasing port...")
                    subprocess.run(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as exc:
        # Pre-startup port check is advisory; continue starting uvicorn even if netstat/taskkill fails
        import logging
        logging.getLogger("uvicorn.error").debug("Port occupancy check skipped: %s", exc)

if __name__ == '__main__':
    free_port_if_occupied(3000)

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
