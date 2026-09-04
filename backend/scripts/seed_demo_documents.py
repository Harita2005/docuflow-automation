"""
Seed 5 Fresh Demo Documents for Live Presentation
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

from seed_demo_documents import seed_five_demo_documents

if __name__ == "__main__":
    seed_five_demo_documents()
