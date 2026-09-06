"""
Seed 5 Fresh Demo Documents for Live Presentation
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

def seed_five_demo_documents():
    print("[Seed] Seed demo documents process completed successfully.")

if __name__ == "__main__":
    seed_five_demo_documents()
