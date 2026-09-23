import sys
sys.path.insert(0, '.')
import sqlalchemy as sa
from app.database.connection import engine

inspector = sa.inspect(engine)
cols = inspector.get_columns('documents')
for c in cols:
    print(f"{c['name']}: {c['type']}")
