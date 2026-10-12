import json
import os
from app.database.connection import SessionLocal
from app.database.models import Division

def seed_divisions():
    db = SessionLocal()
    try:
        # Load divisions from matrix_options.json
        json_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "matrix_options.json")
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        divisions_list = data.get("divisions", [])

        # Also include standard system divisions if not in list
        standard_divs = ["HQ", "SD", "GLOBAL"]
        all_codes = list(dict.fromkeys(divisions_list + standard_divs))

        existing = {d.code.strip(): d for d in db.query(Division).all()}
        inserted_count = 0

        for code in all_codes:
            code_str = code.strip()
            if not code_str:
                continue
            if code_str not in existing:
                div = Division(
                    code=code_str,
                    name=f"{code_str} Division",
                    is_active=True
                )
                db.add(div)
                inserted_count += 1

        db.commit()
        total_now = db.query(Division).count()
        print(f"Seeding completed. Inserted {inserted_count} new divisions. Total active in DB: {total_now}")
        return total_now
    finally:
        db.close()

if __name__ == "__main__":
    seed_divisions()
