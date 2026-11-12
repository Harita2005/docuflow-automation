"""
Document In-App & Workflow Notification Dispatcher Service.
Extracted from documents.py as part of AUD-HI-04 modularization.
Handles targeted, fully-configurable in-app notifications for assignment, approval, and rejection.
"""

import json
import logging
import os
import re
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.database.models import Invoice, InAppNotification

logger = logging.getLogger(__name__)

CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app_config.json')

DEFAULT_INAPP_TEMPLATES = {
    "PENDING_APPROVAL": {
        "enabled": True,
        "title_template": "Action Required: {{document_number}} Assigned to You (Stage {{approval_stage}})",
        "message_template": "New document '{{document_number}}' ({{vendor_name}} {{amount}}) uploaded and assigned to you for verification at Stage {{approval_stage}}."
    },
    "ASSIGNED": {
        "enabled": True,
        "title_template": "Action Required: {{document_number}} Assigned to You (Stage {{approval_stage}})",
        "message_template": "Document '{{document_number}}' ({{vendor_name}} {{amount}}) has been assigned to you for Stage {{approval_stage}} verification."
    },
    "APPROVED": {
        "enabled": True,
        "title_template": "Approval Confirmed: Stage {{prev_stage}} Completed",
        "message_template": "You successfully signed off on Stage {{prev_stage}}. Document routed to Stage {{new_stage}} ({{assigned_to}})."
    },
    "COMPLETED": {
        "enabled": True,
        "title_template": "Document Fully Settled: {{document_number}}",
        "message_template": "Document '{{document_number}}' ({{vendor_name}} {{amount}}) has received final sign-off and is settled and archived."
    },
    "REJECTED": {
        "enabled": True,
        "title_template": "Document Process Cancelled: {{document_number}}",
        "message_template": "Document '{{document_number}}' has been cancelled by {{approver_name}}. Reason: {{remarks}}"
    },
    "SENT_BACK": {
        "enabled": True,
        "title_template": "Action Required: {{document_number}} Returned to You (Stage {{to_stage}})",
        "message_template": "Document '{{document_number}}' ({{vendor_name}} {{amount}}) was returned by {{approver_name}} at Stage {{from_stage}} to your desk for review. Reason: {{remarks}}"
    },
    "CLARIFICATION": {
        "enabled": True,
        "title_template": "Clarification: {{document_number}}",
        "message_template": "Clarification requested for document {{document_number}}. Reason: {{remarks}}"
    }
}


def get_inapp_config(event_type: str) -> Dict[str, Any]:
    """Retrieve saved template & enabled state for a trigger event from app_config.json, with robust fallback."""
    cfg = DEFAULT_INAPP_TEMPLATES.get(event_type, {"enabled": True, "title_template": "", "message_template": ""})
    try:
        if os.path.exists(CONFIG_FILE_PATH):
            with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
                all_configs = json.load(f)
                for item in all_configs:
                    if item.get('key') == 'INAPP_NOTIFICATIONS_CONFIG':
                        stored_val = item.get('value', '[]')
                        parsed = json.loads(stored_val) if isinstance(stored_val, str) else stored_val
                        if isinstance(parsed, list):
                            for entry in parsed:
                                if entry.get('trigger_event') == event_type or entry.get('event') == event_type:
                                    return {
                                        "enabled": entry.get('enabled', True),
                                        "title_template": entry.get('title_template') or cfg.get('title_template', ''),
                                        "message_template": entry.get('message_template') or cfg.get('message_template', '')
                                    }
    except Exception as exc:
        logger.debug("Failed reading in-app notification config for %s: %s", event_type, exc)
    return cfg


def render_inapp_template(template_str: str, context: Dict[str, Any], default_str: str) -> str:
    """Replaces {{variable}} placeholders with context values."""
    if not template_str or not template_str.strip():
        return default_str
    rendered = template_str
    for k, v in context.items():
        placeholder = f"{{{{{k}}}}}"
        val_str = str(v) if v is not None else ""
        rendered = rendered.replace(placeholder, val_str)
    rendered = re.sub(r'\{\{[^}]+\}\}', '', rendered).strip()
    return rendered or default_str


def dispatch_assignment_inapp_notification(db: Session, inv: Invoice, assigned_target: Optional[str] = None):
    """Generates real-time in-app notification when a document is ingested and assigned to Stage 1."""
    try:
        cfg = get_inapp_config('ASSIGNED')
        if not cfg.get('enabled', True):
            return

        target_str = assigned_target or inv.assigned_approver
        if not target_str or target_str.startswith('Unassigned') or target_str.startswith('System'):
            return
        inv_title = inv.invoice_number or inv.id or 'Document'
        vendor_info = inv.vendor_name or 'Vendor'
        amt_str = f'INR {inv.amount:,.2f}' if inv.amount else ''
        targets = [t.strip() for t in target_str.split(',') if t.strip()]

        for target in targets:
            # Prevent duplicate unread assignment notifications for the same doc and stage
            existing = db.query(InAppNotification).filter(
                InAppNotification.document_id == str(inv.id),
                InAppNotification.recipient_handle == target,
                InAppNotification.notification_type == 'PENDING_APPROVAL',
                InAppNotification.is_read == False,
                InAppNotification.title.like('%(Stage 1)%')
            ).first()
            if existing:
                continue

            ctx = {
                'document_number': inv_title,
                'document_type': inv.document_type or 'Document',
                'vendor_name': vendor_info,
                'amount': amt_str,
                'currency': inv.currency or 'INR',
                'approval_stage': 1,
                'stage': 1,
                'assigned_to': target,
                'initiator_name': getattr(inv, 'contact_person', None) or getattr(inv, 'created_by', None) or 'System',
                'initiator_email': getattr(inv, 'requestor_email', None) or '',
                'due_date': str(getattr(inv, 'due_date', '')) if getattr(inv, 'due_date', None) else '',
            }

            title = render_inapp_template(
                cfg.get('title_template'),
                ctx,
                default_str=f'Action Required: {inv_title} Assigned to You (Stage 1)'
            )
            message = render_inapp_template(
                cfg.get('message_template'),
                ctx,
                default_str=f"New document '{inv_title}' ({vendor_info} {amt_str}) uploaded and assigned to you for verification at Stage 1."
            )

            db.add(InAppNotification(
                document_id=str(inv.id),
                recipient_handle=target,
                notification_type='PENDING_APPROVAL',
                title=title,
                message=message,
                is_read=False
            ))
        db.flush()
    except Exception as e:
        logger.debug('Handled exception in assignment notification: %s', e)


def dispatch_approval_inapp_notifications(
    db: Session,
    inv: Invoice,
    approver_name: str,
    prev_stage: int,
    new_stage: int,
    next_approver_target: Optional[str] = None,
    is_completed: bool = False
):
    """Generates real-time targeted in-app notifications when a document is approved and routed."""
    try:
        inv_title = inv.invoice_number or inv.id or 'Document'
        vendor_info = inv.vendor_name or 'Vendor'
        amt_str = f'INR {inv.amount:,.2f}' if inv.amount else ''

        base_ctx = {
            'document_number': inv_title,
            'document_type': inv.document_type or 'Document',
            'vendor_name': vendor_info,
            'amount': amt_str,
            'currency': inv.currency or 'INR',
            'approval_stage': new_stage,
            'stage': new_stage,
            'prev_stage': prev_stage,
            'new_stage': new_stage,
            'from_stage': prev_stage,
            'to_stage': new_stage,
            'approver_name': approver_name,
            'assigned_to': next_approver_target or '',
            'initiator_name': getattr(inv, 'contact_person', None) or getattr(inv, 'created_by', None) or 'System',
            'initiator_email': getattr(inv, 'requestor_email', None) or '',
            'due_date': str(getattr(inv, 'due_date', '')) if getattr(inv, 'due_date', None) else '',
        }

        # 1. Action Required notification for next stage approver(s)
        if not is_completed and next_approver_target:
            cfg_pending = get_inapp_config('PENDING_APPROVAL')
            if cfg_pending.get('enabled', True):
                next_targets = [t.strip() for t in next_approver_target.split(',') if t.strip()]
                for target in next_targets:
                    if target.startswith('Unassigned') or target.startswith('System'):
                        continue
                    # Duplicate prevention for next stage approver
                    existing = db.query(InAppNotification).filter(
                        InAppNotification.document_id == str(inv.id),
                        InAppNotification.recipient_handle == target,
                        InAppNotification.notification_type == 'PENDING_APPROVAL',
                        InAppNotification.is_read == False,
                        InAppNotification.title.like(f'%(Stage {new_stage})%')
                    ).first()
                    if not existing:
                        target_ctx = dict(base_ctx, assigned_to=target)
                        title = render_inapp_template(
                            cfg_pending.get('title_template'),
                            target_ctx,
                            default_str=f'Action Required: {inv_title} Assigned to You (Stage {new_stage})'
                        )
                        message = render_inapp_template(
                            cfg_pending.get('message_template'),
                            target_ctx,
                            default_str=f"Document '{inv_title}' ({vendor_info} {amt_str}) was verified and signed off by {approver_name} at Stage {prev_stage}. It is now pending your sign-off at Stage {new_stage}."
                        )
                        notif = InAppNotification(
                            document_id=str(inv.id),
                            recipient_handle=target,
                            notification_type='PENDING_APPROVAL',
                            title=title,
                            message=message,
                            is_read=False
                        )
                        db.add(notif)

        # 2. Informational approval notification for the approver who provided sign-off
        event_key = 'COMPLETED' if is_completed else 'APPROVED'
        cfg_app = get_inapp_config(event_key)
        if cfg_app.get('enabled', True):
            app_title = render_inapp_template(
                cfg_app.get('title_template'),
                base_ctx,
                default_str=f'Approval Confirmed: Stage {prev_stage} Completed' if not is_completed else f'Document {inv_title} Fully Settled'
            )
            app_msg = render_inapp_template(
                cfg_app.get('message_template'),
                base_ctx,
                default_str=f'You successfully signed off on Stage {prev_stage}. Document routed to Stage {new_stage} ({next_approver_target}).' if not is_completed else f"You provided final sign-off for '{inv_title}'. Document is settled and archived."
            )
            db.add(InAppNotification(
                document_id=str(inv.id),
                recipient_handle=approver_name,
                notification_type='COMPLETED' if is_completed else 'APPROVED',
                title=app_title,
                message=app_msg,
                is_read=False
            ))

        # 3. Informational approval notification for the document creator / requestor
        creator_handle = getattr(inv, 'contact_person', None) or getattr(inv, 'created_by', None) or getattr(inv, 'requestor_email', None)
        if creator_handle:
            c_handle_str = str(creator_handle).strip()
            # Only notify if creator is distinct from the approver
            if c_handle_str.lower() != approver_name.lower():
                cfg_creator = get_inapp_config('COMPLETED' if is_completed else 'APPROVED')
                if cfg_creator.get('enabled', True):
                    cr_title = render_inapp_template(
                        cfg_creator.get('title_template'),
                        base_ctx,
                        default_str=f'Document Fully Approved: {inv_title}' if is_completed else f'Invoice Approved: Stage {prev_stage} Passed ({inv_title})'
                    )
                    cr_msg = render_inapp_template(
                        cfg_creator.get('message_template'),
                        base_ctx,
                        default_str=f"Document '{inv_title}' ({vendor_info} {amt_str}) has received final sign-off from {approver_name} and is settled and archived." if is_completed else f"Document '{inv_title}' was verified and signed off by {approver_name} at Stage {prev_stage}. It has progressed to Stage {new_stage}."
                    )
                    db.add(InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=c_handle_str,
                        notification_type='COMPLETED' if is_completed else 'APPROVED',
                        title=cr_title,
                        message=cr_msg,
                        is_read=False
                    ))

        db.flush()
    except Exception as e:
        logger.debug('Handled exception in approval notification: %s', e)


def dispatch_rejection_inapp_notifications(
    db: Session,
    inv: Invoice,
    approver_name: str,
    from_stage: int,
    to_stage: int,
    remarks: str,
    target_approver: Optional[str] = None,
    is_cancelled: bool = False
):
    """Generates real-time targeted in-app notifications when a document is rejected / sent back or cancelled."""
    try:
        inv_title = inv.invoice_number or inv.id or 'Document'
        vendor_info = inv.vendor_name or 'Vendor'
        amt_str = f'INR {inv.amount:,.2f}' if inv.amount else ''
        creator_handle = getattr(inv, 'contact_person', None) or getattr(inv, 'created_by', None) or getattr(inv, 'requestor_email', None)

        base_ctx = {
            'document_number': inv_title,
            'document_type': inv.document_type or 'Document',
            'vendor_name': vendor_info,
            'amount': amt_str,
            'currency': inv.currency or 'INR',
            'from_stage': from_stage,
            'to_stage': to_stage,
            'approval_stage': to_stage,
            'stage': to_stage,
            'approver_name': approver_name,
            'remarks': remarks or '',
            'reason': remarks or '',
            'assigned_to': target_approver or '',
            'initiator_name': getattr(inv, 'contact_person', None) or getattr(inv, 'created_by', None) or 'System',
            'initiator_email': getattr(inv, 'requestor_email', None) or '',
            'due_date': str(getattr(inv, 'due_date', '')) if getattr(inv, 'due_date', None) else '',
        }

        if is_cancelled:
            cfg_rej = get_inapp_config('REJECTED')
            if cfg_rej.get('enabled', True):
                rej_title = render_inapp_template(
                    cfg_rej.get('title_template'),
                    base_ctx,
                    default_str=f'Document Process Cancelled: {inv_title}'
                )
                rej_msg = render_inapp_template(
                    cfg_rej.get('message_template'),
                    base_ctx,
                    default_str=f"Document '{inv_title}' has been cancelled by {approver_name}. Reason: {remarks}"
                )
                if creator_handle:
                    db.add(InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=str(creator_handle).strip(),
                        notification_type='REJECTED',
                        title=rej_title,
                        message=rej_msg,
                        is_read=False
                    ))
                if not creator_handle or str(creator_handle).strip().lower() != approver_name.lower():
                    db.add(InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=approver_name,
                        notification_type='REJECTED',
                        title=rej_title,
                        message=render_inapp_template(
                            cfg_rej.get('message_template'),
                            dict(base_ctx, approver_name='You'),
                            default_str=f"You cancelled document '{inv_title}'. Reason: {remarks}"
                        ),
                        is_read=False
                    ))
        else:
            cfg_sentback = get_inapp_config('SENT_BACK')
            if cfg_sentback.get('enabled', True):
                if target_approver:
                    targets = [t.strip() for t in target_approver.split(',') if t.strip()]
                    for target in targets:
                        if target.startswith('Unassigned') or target.startswith('System'):
                            continue
                        existing = db.query(InAppNotification).filter(
                            InAppNotification.document_id == str(inv.id),
                            InAppNotification.recipient_handle == target,
                            InAppNotification.notification_type == 'SENT_BACK',
                            InAppNotification.is_read == False,
                            InAppNotification.title.like(f'%(Stage {to_stage})%')
                        ).first()
                        if not existing:
                            t_ctx = dict(base_ctx, assigned_to=target)
                            db.add(InAppNotification(
                                document_id=str(inv.id),
                                recipient_handle=target,
                                notification_type='SENT_BACK',
                                title=render_inapp_template(
                                    cfg_sentback.get('title_template'),
                                    t_ctx,
                                    default_str=f'Action Required: {inv_title} Returned to You (Stage {to_stage})'
                                ),
                                message=render_inapp_template(
                                    cfg_sentback.get('message_template'),
                                    t_ctx,
                                    default_str=f"Document '{inv_title}' ({vendor_info} {amt_str}) was rejected by {approver_name} at Stage {from_stage} and returned to your desk for review. Reason: {remarks}"
                                ),
                                is_read=False
                            ))

                db.add(InAppNotification(
                    document_id=str(inv.id),
                    recipient_handle=approver_name,
                    notification_type='REJECTED',
                    title=f'Returned to Previous Stage: Stage {to_stage}',
                    message=f"You returned document '{inv_title}' back to Stage {to_stage} ({target_approver or 'Initiator Desk'}). Reason: {remarks}",
                    is_read=False
                ))

                if creator_handle:
                    c_str = str(creator_handle).strip()
                    targets_list = [t.strip().lower() for t in (target_approver or '').split(',') if t.strip()]
                    if c_str.lower() != approver_name.lower() and (not target_approver or c_str.lower() not in targets_list):
                        db.add(InAppNotification(
                            document_id=str(inv.id),
                            recipient_handle=c_str,
                            notification_type='REJECTED',
                            title=render_inapp_template(
                                cfg_sentback.get('title_template'),
                                base_ctx,
                                default_str=f'Document Returned: {inv_title} (Stage {to_stage})'
                            ),
                            message=render_inapp_template(
                                cfg_sentback.get('message_template'),
                                base_ctx,
                                default_str=f"Document '{inv_title}' was reviewed by {approver_name} at Stage {from_stage} and returned to Stage {to_stage}. Reason: {remarks}"
                            ),
                            is_read=False
                        ))
        db.flush()
    except Exception as e:
        logger.debug('Handled exception in rejection notification: %s', e)
