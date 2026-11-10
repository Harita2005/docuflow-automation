"""
Document In-App & Workflow Notification Dispatcher Service.
Extracted from documents.py as part of AUD-HI-04 modularization.
Handles targeted in-app notifications for assignment, approval, and rejection.
"""

import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.database.models import Invoice, InAppNotification

logger = logging.getLogger(__name__)


def dispatch_assignment_inapp_notification(db: Session, inv: Invoice, assigned_target: Optional[str] = None):
    """Generates real-time in-app notification when a document is ingested and assigned to Stage 1."""
    try:
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

            db.add(InAppNotification(
                document_id=str(inv.id),
                recipient_handle=target,
                notification_type='PENDING_APPROVAL',
                title=f'Action Required: {inv_title} Assigned to You (Stage 1)',
                message=f"New document '{inv_title}' ({vendor_info} {amt_str}) uploaded and assigned to you for verification at Stage 1.",
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

        # 1. Action Required notification for next stage approver(s)
        if not is_completed and next_approver_target:
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
                    notif = InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=target,
                        notification_type='PENDING_APPROVAL',
                        title=f'Action Required: {inv_title} Assigned to You (Stage {new_stage})',
                        message=f"Document '{inv_title}' ({vendor_info} {amt_str}) was verified and signed off by {approver_name} at Stage {prev_stage}. It is now pending your sign-off at Stage {new_stage}.",
                        is_read=False
                    )
                    db.add(notif)

        # 2. Informational approval notification for the approver who provided sign-off (APPROVED, not PENDING_APPROVAL)
        db.add(InAppNotification(
            document_id=str(inv.id),
            recipient_handle=approver_name,
            notification_type='COMPLETED' if is_completed else 'APPROVED',
            title=f'Approval Confirmed: Stage {prev_stage} Completed' if not is_completed else f'Document {inv_title} Fully Settled',
            message=f'You successfully signed off on Stage {prev_stage}. Document routed to Stage {new_stage} ({next_approver_target}).' if not is_completed else f"You provided final sign-off for '{inv_title}'. Document is settled and archived.",
            is_read=False
        ))

        # 3. Informational approval notification for the document creator / requestor
        creator_handle = getattr(inv, 'contact_person', None) or getattr(inv, 'created_by', None) or getattr(inv, 'requestor_email', None)
        if creator_handle:
            c_handle_str = str(creator_handle).strip()
            # Only notify if creator is distinct from the approver
            if c_handle_str.lower() != approver_name.lower():
                if is_completed:
                    db.add(InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=c_handle_str,
                        notification_type='COMPLETED',
                        title=f'Document Fully Approved: {inv_title}',
                        message=f"Document '{inv_title}' ({vendor_info} {amt_str}) has received final sign-off from {approver_name} and is settled and archived.",
                        is_read=False
                    ))
                else:
                    db.add(InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=c_handle_str,
                        notification_type='APPROVED',
                        title=f'Invoice Approved: Stage {prev_stage} Passed ({inv_title})',
                        message=f"Document '{inv_title}' was verified and signed off by {approver_name} at Stage {prev_stage}. It has progressed to Stage {new_stage}.",
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

        if is_cancelled:
            if creator_handle:
                db.add(InAppNotification(
                    document_id=str(inv.id),
                    recipient_handle=str(creator_handle).strip(),
                    notification_type='REJECTED',
                    title=f'Document Process Cancelled: {inv_title}',
                    message=f"Document '{inv_title}' has been cancelled by {approver_name}. Reason: {remarks}",
                    is_read=False
                ))
            if not creator_handle or str(creator_handle).strip().lower() != approver_name.lower():
                db.add(InAppNotification(
                    document_id=str(inv.id),
                    recipient_handle=approver_name,
                    notification_type='REJECTED',
                    title=f'Document Process Cancelled: {inv_title}',
                    message=f"You cancelled document '{inv_title}'. Reason: {remarks}",
                    is_read=False
                ))
        else:
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
                        db.add(InAppNotification(
                            document_id=str(inv.id),
                            recipient_handle=target,
                            notification_type='SENT_BACK',
                            title=f'Action Required: {inv_title} Returned to You (Stage {to_stage})',
                            message=f"Document '{inv_title}' ({vendor_info} {amt_str}) was rejected by {approver_name} at Stage {from_stage} and returned to your desk for review. Reason: {remarks}",
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
                if c_str.lower() != approver_name.lower() and (not target_approver or c_str.lower() not in [t.lower() for t in targets]):
                    db.add(InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=c_str,
                        notification_type='REJECTED',
                        title=f'Document Returned: {inv_title} (Stage {to_stage})',
                        message=f"Document '{inv_title}' was reviewed by {approver_name} at Stage {from_stage} and returned to Stage {to_stage}. Reason: {remarks}",
                        is_read=False
                    ))
        db.flush()
    except Exception as e:
        logger.debug('Handled exception in rejection notification: %s', e)
