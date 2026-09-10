import logging
from sqlalchemy.orm import Session

import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.database.connection import SessionLocal
from app.database import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def purge_demo_data():
    """Delete all demo/seed data from the database while preserving user accounts and related tables."""
    db: Session = SessionLocal()
    try:
        # List of model classes to purge (excluding user-related tables)
        purge_models = [
            models.DocumentApprovalLog,
            models.DocumentChecklistState,
            models.DocumentLineItem,
            models.Document,
            models.BusinessRule,
            models.ChecklistRule,
            models.ChecklistTemplate,
            models.WorkflowStep,
            models.WorkflowStepDefinition,
            models.WorkflowProfile,
        ]
        for model in purge_models:
            count = db.query(model).delete(synchronize_session=False)
            logger.info("Deleted %s rows from %s", count, model.__tablename__)
        db.commit()
        logger.info("Demo data purge completed successfully.")
    except Exception as e:
        db.rollback()
        logger.exception("Error during demo data purge: %s", e)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    purge_demo_data()
