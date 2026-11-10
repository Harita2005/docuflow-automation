"""
Document Storage & Physical Archiving Service.
Extracted from documents.py as part of AUD-HI-04 modularization.
Handles path normalization, safe naming, and physical PDF archival.
"""

import datetime
import json
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Optional, Tuple

from app.config.settings import settings
from app.database.models import Invoice

logger = logging.getLogger(__name__)

CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app_config.json')


def load_storage_configs() -> list:
    """Reads app_config.json safely."""
    if not os.path.exists(CONFIG_FILE_PATH):
        return []
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as exc:
        logger.debug('Handled exception loading storage config: %s', exc)
        return []


def extract_date_components(date_str: Optional[str]) -> Tuple[str, str, str]:
    """Extracts (YYYY, MM_MonthName, DD) from a date string or defaults to current UTC time."""
    if date_str:
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%d.%m.%Y', '%Y-%m-%dT%H:%M:%S'):
            try:
                dt = datetime.datetime.strptime(str(date_str).strip()[:19], fmt)
                return (dt.strftime('%Y'), dt.strftime('%m_%B'), dt.strftime('%d'))
            except Exception as exc:
                logger.debug('Handled exception in extract_date_components: %s', exc)
    now = datetime.datetime.utcnow()
    return (now.strftime('%Y'), now.strftime('%m_%B'), now.strftime('%d'))


def normalize_doc_type_folder(doc_type: Optional[str]) -> str:
    """Normalizes document category/type to a clean folder name (INVOICE, CREDIT_NOTE, DEBIT_NOTE, etc.)."""
    if not doc_type:
        return 'INVOICE'
    raw = str(doc_type).strip().upper()
    if 'CREDIT' in raw:
        return 'CREDIT_NOTE'
    elif 'DEBIT' in raw:
        return 'DEBIT_NOTE'
    elif 'EVOUCH' in raw or 'E-VOUCH' in raw or 'E_VOUCH' in raw:
        return 'E_VOUCHER'
    elif 'CAPEX' in raw or 'ASSET' in raw:
        return 'CAPEX'
    elif 'PURCHASE' in raw or 'PO_' in raw or 'PO ' in raw:
        return 'PURCHASE_INVOICE'
    elif 'RENT' in raw or 'UTILITY' in raw or 'EB' in raw:
        return 'RENT_UTILITY'
    elif 'FREIGHT' in raw or 'TRANSPORT' in raw:
        return 'FREIGHT'
    elif 'GRN' in raw or 'RECEIPT' in raw:
        return 'GRN_RECEIPT'
    elif 'ADVANCE' in raw:
        return 'ADVANCE_VOUCHER'
    elif 'JOURNAL' in raw or 'JRNL' in raw:
        return 'JOURNAL_VOUCHER'
    elif 'INVOICE' in raw or 'AP' in raw:
        return 'INVOICE'
    else:
        clean = re.sub('[^A-Z0-9_]+', '_', raw).strip('_')
        return clean or 'INVOICE'


def sanitize_name(text: Optional[str]) -> str:
    """Removes invalid filename characters for safe filesystem naming."""
    if not text:
        return ''
    return re.sub('[^a-zA-Z0-9_\\-\\.]', '_', str(text)).strip('_')


def get_storage_config() -> Tuple[str, str]:
    """Reads system admin config for physical storage root directory and folder pattern."""
    configs = load_storage_configs()
    root_dir = 'stored_pdfs'
    pattern = '{YEAR}/{MONTH}/{DOC_TYPE}'
    for c in configs:
        if c.get('key') == 'STORAGE_ROOT_DIR' and c.get('value'):
            root_dir = str(c.get('value')).strip()
        if c.get('key') == 'STORAGE_FOLDER_PATTERN' and c.get('value'):
            pattern = str(c.get('value')).strip().strip('/\\')
    return (root_dir, pattern)


def get_storage_root_path() -> Path:
    """Returns absolute OS Path for the configured root storage location."""
    root_dir_name, _ = get_storage_config()
    p = Path(root_dir_name)
    if p.is_absolute():
        return p
    return settings.PDF_STORAGE_DIR


def get_archived_pdf_path(inv: Invoice) -> Path:
    """
    Constructs the storage path for approved documents under storage root:
    year/month/document folder.
    """
    raw_doc_num = os.path.basename(str(inv.invoice_number or inv.doc_num or 'DOC'))
    clean_doc_num = re.sub('[^a-zA-Z0-9_\\-\\.]', '', raw_doc_num)
    raw_id = os.path.basename(str(inv.id) if inv.id else '0')
    clean_id = re.sub('[^a-zA-Z0-9_\\-\\.]', '', raw_id)
    filename = f'{clean_doc_num}_{clean_id}.pdf'

    dt = inv.created_at or datetime.datetime.utcnow()
    year_str = dt.strftime('%Y')
    month_str = dt.strftime('%m')
    doc_type_str = sanitize_name(inv.document_type or 'document')

    base_root = get_storage_root_path().resolve()
    target_path = (base_root / 'approved' / year_str / month_str / doc_type_str / filename).resolve()
    if target_path.is_relative_to(base_root):
        return target_path
    return base_root / 'approved' / filename


def get_rejected_pdf_path(inv: Invoice) -> Path:
    """
    Constructs the storage path for rejected/cancelled documents:
    stored_pdfs/rejected/{DOC_NUM}_{PRIMARY_KEY}.pdf
    """
    safe_doc_num = os.path.basename(str(inv.invoice_number or inv.doc_num or 'DOC'))
    clean_doc_num = re.sub('[^a-zA-Z0-9_\\-\\.]', '', safe_doc_num)
    safe_id = os.path.basename(str(inv.id) if inv.id else '0')
    clean_id = re.sub('[^a-zA-Z0-9_\\-\\.]', '', safe_id)
    filename = f'{clean_doc_num}_{clean_id}.pdf'
    base_rejected = settings.REJECTED_PDF_DIR.resolve()
    target_path = (base_rejected / filename).resolve()
    if target_path.is_relative_to(base_rejected):
        return target_path
    return base_rejected / filename


def archive_approved_pdf(inv: Invoice) -> bool:
    """
    Archival helper:
    1. Saves approved physical PDF into configured folders under stored_pdfs/approved/year/month/document.
    2. Updates inv.file_url and inv.file_path in the database.
    3. Deletes temporary upload file from uploads/ directory.
    Returns True if archive succeeded (or was already archived), False otherwise.
    """
    try:
        if not inv:
            return False
        dest_approved = get_archived_pdf_path(inv).resolve()

        if dest_approved.exists() and getattr(inv, 'file_path', None) == str(dest_approved):
            return True

        safe_base = os.path.basename(inv.file_url) if inv.file_url else ''
        clean_filename = re.sub('[^a-zA-Z0-9_\\-\\.]', '', safe_base)
        upload_root = settings.UPLOAD_DIR.resolve()
        legacy_root = settings.PDF_STORAGE_DIR.resolve()
        upload_path = (upload_root / clean_filename).resolve() if clean_filename else None
        legacy_storage_path = (legacy_root / clean_filename).resolve() if clean_filename else None
        src_path = None
        if getattr(inv, 'file_path', None) and Path(inv.file_path).exists():
            src_path = Path(inv.file_path).resolve()
        elif upload_path and upload_path.is_relative_to(upload_root) and upload_path.exists():
            src_path = upload_path
        elif legacy_storage_path and legacy_storage_path.is_relative_to(legacy_root) and legacy_storage_path.exists():
            src_path = legacy_storage_path
        if src_path and src_path.exists():
            dest_approved.parent.mkdir(parents=True, exist_ok=True)
            if src_path != dest_approved:
                shutil.copy2(str(src_path), str(dest_approved))
                logger.info(f'[Archive] Successfully archived approved PDF for document {inv.id} to {dest_approved}')
                if upload_path and upload_path.exists() and (upload_path != dest_approved):
                    try:
                        upload_path.unlink()
                    except Exception as exc:
                        logger.debug('Handled exception removing upload temp copy: %s', exc)
            inv.file_url = f'/api/documents/{inv.id}/file'
            inv.file_path = str(dest_approved)
            return True
        return False
    except Exception as e:
        logger.error(f'[Archive] Error archiving approved PDF for document {getattr(inv, "id", "N/A")}: {e}')
        return False


def archive_rejected_pdf(inv: Invoice):
    """
    Purges/deletes physical PDF files for rejected or cancelled documents.
    Only approved documents are permanently stored on disk.
    """
    try:
        if not inv or not inv.file_url:
            return
        filename = os.path.basename(inv.file_url)
        upload_path = settings.UPLOAD_DIR / filename
        if upload_path.exists():
            try:
                upload_path.unlink()
                logger.info(f'[Purge] Purged rejected document file from uploads: {upload_path}')
            except Exception as del_err:
                logger.debug('Handled exception in archive_rejected_pdf: %s', del_err)
    except Exception as e:
        logger.debug('Handled exception in archive_rejected_pdf: %s', e)
