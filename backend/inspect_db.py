from app.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
tables = inspector.get_table_names()
print(f'Total tables: {len(tables)}\n')
for t in sorted(tables):
    cols = inspector.get_columns(t)
    fks = inspector.get_foreign_keys(t)
    print(f'[{t}]  ({len(cols)} cols)')
    for c in cols:
        print(f'  {c["name"]:35} {str(c["type"]):25} null={c["nullable"]}')
    for fk in fks:
        print(f'  FK: {fk["constrained_columns"]} -> {fk["referred_table"]}.{fk["referred_columns"]}')
    print()
