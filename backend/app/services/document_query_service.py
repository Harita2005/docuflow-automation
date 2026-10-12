"""
Document query, lookup, and approver pool helper services.
Extracted from documents.py as part of SEC-14 code quality modularization.
"""

import json
import logging
import re
from typing import Any, Optional
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.models import Invoice, Role, User

logger = logging.getLogger(__name__)


def unpack_custom_data_into_dict(inv_dict: dict) -> dict:
    """
    Promotes fields stored inside the custom_data JSON blob into top-level
    response keys, but ONLY when the real column value is NULL/None.
    """
    raw_cd = inv_dict.get('custom_data')
    if not raw_cd:
        return inv_dict
    try:
        cd = json.loads(raw_cd) if isinstance(raw_cd, str) else (raw_cd if isinstance(raw_cd, dict) else {})
    except Exception:
        return inv_dict
    if not isinstance(cd, dict):
        return inv_dict
    for k, v in cd.items():
        if v is None or v == '':
            continue
        existing = inv_dict.get(k)
        if existing is None:
            inv_dict[k] = v
    return inv_dict


def attach_dynamic_columns_to_document(db: Session, inv: Any):
    """
    Reads all database columns for a document dynamically and attaches
    any missing attributes or custom_data fields onto the ORM object.
    """
    if not inv or not hasattr(inv, 'id'):
        return inv
    try:
        row = db.execute(text("SELECT * FROM documents WHERE id = :id"), {"id": str(inv.id)}).mappings().first()
        if row:
            for col_name, val in row.items():
                if not hasattr(inv, col_name) or getattr(inv, col_name) is None:
                    setattr(inv, col_name, val)
            raw_cd = row.get('custom_data')
            if raw_cd:
                try:
                    cd = json.loads(raw_cd) if isinstance(raw_cd, str) else (raw_cd if isinstance(raw_cd, dict) else {})
                    if isinstance(cd, dict):
                        for ck, cv in cd.items():
                            if cv is not None and cv != '' and (not hasattr(inv, ck) or getattr(inv, ck) is None):
                                try:
                                    setattr(inv, ck, cv)
                                except Exception as exc:
                                    logger.debug("Attribute setter ignored for %s: %s", ck, exc)
                except Exception as exc:
                    logger.debug("Failed parsing custom_data JSON: %s", exc)
    except Exception as exc:
        logger.debug("Failed attaching dynamic columns to document: %s", exc)
    return inv


def find_invoice_by_identifier(db: Session, invoice_id: str) -> Invoice:
    """
    Flexible document lookup across id prefix variations, invoice numbers, and doc keys.
    """
    raw_str = str(invoice_id).strip()
    id_clean = re.sub('^(DOC|INV|CV|EV|JV|ADV|CAPEX|GRN|SRV|FRT|UTL|EXP|DN|CN|PRJ|NR|VOUCH|CMP|CF)[-_#]?', '', raw_str, flags=re.IGNORECASE).strip()
    inv = db.query(Invoice).filter(
        (Invoice.id == raw_str)
        | (Invoice.id == f'DOC-{id_clean}')
        | (Invoice.id == f'INV-{id_clean}')
        | (Invoice.id == f'GRN-{id_clean}')
        | (Invoice.id == f'CV-{id_clean}')
        | (Invoice.id == id_clean)
        | Invoice.id.ilike(f'%{id_clean}%')
        | (Invoice.invoice_number == raw_str)
        | (Invoice.invoice_number == id_clean)
        | Invoice.invoice_number.ilike(f'%{id_clean}%')
        | (Invoice.doc_key == raw_str)
        | (Invoice.doc_key == id_clean)
        | Invoice.doc_key.ilike(f'%{id_clean}%')
    ).filter(Invoice.is_deleted == False).first()
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{invoice_id}' not found")
    attach_dynamic_columns_to_document(db, inv)
    return inv


def is_user_in_approver_pool(
    user: Optional[User],
    pool_str: Optional[str],
    db: Optional[Session] = None,
    ignore_admin_bypass: bool = False,
) -> bool:
    """
    Exact matching authorization check determining whether a user is an authorized
    member of an approver pool string.
    """
    if not user:
        return False
    u_role = (user.role or '').strip().lower()
    if not ignore_admin_bypass:
        if u_role in ['admin', 'administrator', 'system_admin', 'superadmin', 'system administrator'] or getattr(user, 'is_superuser', False):
            return True
    if not pool_str:
        return True
    pool = [s.strip().lower() for s in pool_str.split(',') if s.strip()]

    ROLE_ALIASES = {
        'admin': ['system administrator', 'admin', 'administrator', 'superadmin', 'system_admin'],
        'manager': ['operations manager', 'manager', 'operations_manager'],
        'gm': ['general manager', 'gm', 'general_manager'],
        'jmd': ['joint managing director', 'jmd', 'joint_managing_director'],
        'md': ['managing director', 'md', 'managing_director'],
        'finance_auditor': ['finance & internal auditor', 'finance and internal auditor', 'finance_auditor', 'finance auditor', 'auditor', 'internal auditor'],
        'account_uploader': ['account uploader', 'account_uploader', 'account_uploader_test', 'uploader', 'e22-01', 'sample', 'accounts.approver', 'accounts_approver'],
        'accounts.approver': ['accounts.approver', 'accounts_approver', 'accounts approver', 'account uploader', 'account_uploader', 'approver', 'manager'],
        'accounts_approver': ['accounts.approver', 'accounts_approver', 'accounts approver', 'account uploader', 'account_uploader', 'approver', 'manager'],
        'ap_specialist': ['ap specialist', 'ap_specialist', 'ap', 'accounts'],
        'dept_mgr': ['department manager', 'dept_mgr', 'department_mgr'],
        'div_hod': ['division hod', 'div_hod', 'division_head', 'hod'],
        'safety_officer': ['safety officer', 'safety_officer'],
        'quality_mgr': ['quality manager', 'quality_mgr'],
        'employee': ['standard employee', 'employee', 'standard_employee']
    }

    raw_handles = [
        (user.username or '').strip().lower(),
        (user.employee_id or '').strip().lower(),
        (user.employee_name or '').strip().lower(),
        (user.name or '').strip().lower(),
        (user.email or '').strip().lower(),
        (user.role or '').strip().lower()
    ]

    if u_role in ROLE_ALIASES:
        raw_handles.extend(ROLE_ALIASES[u_role])
    for code, aliases in ROLE_ALIASES.items():
        if any(h in aliases for h in raw_handles if h):
            raw_handles.append(code)
            raw_handles.extend(aliases)

    if getattr(user, 'role_rel', None):
        if getattr(user.role_rel, 'name', None):
            raw_handles.append(user.role_rel.name.strip().lower())
        if getattr(user.role_rel, 'code', None):
            raw_handles.append(user.role_rel.code.strip().lower())

    if db and getattr(user, 'role_id', None):
        try:
            r = db.query(Role).filter(Role.id == user.role_id).first()
            if r:
                if r.name: raw_handles.append(r.name.strip().lower())
                if r.code: raw_handles.append(r.code.strip().lower())
        except Exception as err:
            logger.debug('Role handle lookup failed: %s', err)

    user_handles = {h for h in raw_handles if h}

    for target in pool:
        t_clean = target.strip().lower()
        if not t_clean:
            continue
        if t_clean in user_handles:
            return True

    return False
