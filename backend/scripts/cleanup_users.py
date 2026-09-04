"""
Clean Up Users and Update Workflow Approvers Script for Server Deployment
"""
import sys
from pathlib import Path

# Ensure backend directory is in path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

from cleanup_users import run_server_cleanup

if __name__ == "__main__":
    run_server_cleanup()
