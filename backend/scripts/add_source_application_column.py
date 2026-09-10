import os
import sys
import logging
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import OperationalError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Adjust path to import settings
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))  # add backend to PYTHONPATH
from app.config.settings import settings

def main():
    db_url = settings.get_database_url()
    logger.info(f'Connecting to database: {db_url}')
    engine = create_engine(db_url)
    inspector = inspect(engine)
    if 'documents' not in inspector.get_table_names():
        logger.error('Table "documents" does not exist in the database.')
        return
    columns = [col['name'] for col in inspector.get_columns('documents')]
    if 'source_application' in columns:
        logger.info('Column "source_application" already exists. No action needed.')
        return
    # Add column SQL (adjust for your DB type if needed)
    alter_sql = "ALTER TABLE documents ADD source_application VARCHAR(100) NULL;"
    try:
        with engine.connect() as conn:
            conn.execute(alter_sql)
            logger.info('Added column "source_application" to documents table.')
    except OperationalError as e:
        logger.error(f'Failed to add column: {e}')

if __name__ == '__main__':
    main()
