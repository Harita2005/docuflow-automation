import logging
import asyncio
import json
import time
from typing import Set, Optional, Any
from fastapi import APIRouter, Request, Query, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.database.models import User
from app.auth import get_current_active_user
from app.services.rbac_service import authorize_document_access
from app.routers.documents import find_invoice_by_identifier, is_user_in_approver_pool
from app.services.lock_service import lock_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=['Real-Time Events & Collision Locks'])
_active_listeners: Set[asyncio.Queue] = set()

MIN_LOCK_LEASE_SECONDS = 15
MAX_LOCK_LEASE_SECONDS = 300
DEFAULT_LOCK_LEASE_SECONDS = 180

def _cap_lease_seconds(val: Optional[Any]) -> int:
    try:
        s = int(val)
    except (ValueError, TypeError):
        s = DEFAULT_LOCK_LEASE_SECONDS
    return max(MIN_LOCK_LEASE_SECONDS, min(s, MAX_LOCK_LEASE_SECONDS))

def _is_admin_user(user: User) -> bool:
    u_role = (user.role or "").strip().lower()
    return (
        u_role in {"admin", "administrator", "system_admin", "superadmin"}
        or getattr(user, "is_superuser", False)
    )

def _verify_document_access(user: User, doc_id: str, db: Session):
    inv = find_invoice_by_identifier(db, doc_id)
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
    if not authorize_document_access(user, inv) and not is_user_in_approver_pool(user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail="Access Denied: You are not authorized to access this document")
    return inv

def broadcast_event(event_type: str, payload: dict):
    """
    Broadcasts a real-time event to all connected web clients via SSE.
    """
    event_data = {'type': event_type, 'payload': payload, 'timestamp': time.time()}
    encoded = f'data: {json.dumps(event_data)}\n\n'
    dead_queues = set()
    for q in _active_listeners:
        try:
            q.put_nowait(encoded)
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
    for dq in dead_queues:
        _active_listeners.discard(dq)

@router.get('/api/events/stream')
async def event_stream(request: Request):
    """
    Server-Sent Events (SSE) endpoint.
    Subscribes the browser client to real-time workflow events, document updates, and lock changes.
    """
    queue: asyncio.Queue = asyncio.Queue()
    _active_listeners.add(queue)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'CONNECTED', 'message': 'DocuFlow Real-Time Stream Connected'})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield message
                except asyncio.TimeoutError:
                    # Send an SSE keep-alive comment line every 15s to keep the HTTP chunked connection alive
                    yield ": ping\n\n"
                except asyncio.CancelledError:
                    break
                except Exception as exc:
                    logger.debug("Event stream unexpected loop error: %s", exc)
                    break
        finally:
            _active_listeners.discard(queue)
    return StreamingResponse(
        event_generator(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )

@router.post('/api/invoices/{invoice_id}/lock/acquire')
@router.post('/api/documents/{invoice_id}/lock/acquire')
def acquire_document_lock(
    invoice_id: str,
    payload: Optional[dict] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Acquires an exclusive review lock on a document for the current authenticated user.
    """
    inv = _verify_document_access(current_user, invoice_id, db)
    clean_payload = payload or {}
    user_handle = (current_user.username or current_user.email or f"user_{current_user.id}").strip().lower()
    user_name = current_user.employee_name or current_user.name or current_user.username or "Reviewer"
    lease_seconds = _cap_lease_seconds(clean_payload.get('lease_seconds'))
    result = lock_manager.acquire_lock(
        doc_id=str(inv.id),
        user_handle=user_handle,
        user_name=user_name,
        lease_seconds=lease_seconds,
    )
    if result.get('acquired'):
        broadcast_event(
            'DOCUMENT_LOCKED',
            {
                'document_id': str(inv.id),
                'locked_by': user_name,
                'user_handle': user_handle,
                'expires_in': lease_seconds,
            },
        )
    return result

@router.post('/api/invoices/{invoice_id}/lock/heartbeat')
@router.post('/api/documents/{invoice_id}/lock/heartbeat')
def renew_document_lock(
    invoice_id: str,
    payload: Optional[dict] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Renews the active review lock lease for the authenticated user.
    """
    inv = _verify_document_access(current_user, invoice_id, db)
    clean_payload = payload or {}
    user_handle = (current_user.username or current_user.email or f"user_{current_user.id}").strip().lower()
    lease_seconds = _cap_lease_seconds(clean_payload.get('lease_seconds'))
    return lock_manager.renew_lock(
        doc_id=str(inv.id),
        user_handle=user_handle,
        lease_seconds=lease_seconds,
    )

@router.post('/api/invoices/{invoice_id}/lock/release')
@router.post('/api/documents/{invoice_id}/lock/release')
def release_document_lock(
    invoice_id: str,
    payload: Optional[dict] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Releases the review lock on a document.
    Only the lock owner or an administrator can release the lock.
    """
    inv = _verify_document_access(current_user, invoice_id, db)
    user_handle = (current_user.username or current_user.email or f"user_{current_user.id}").strip().lower()
    is_admin = _is_admin_user(current_user)
    result = lock_manager.release_lock(
        doc_id=str(inv.id),
        user_handle=user_handle,
        is_admin=is_admin,
    )
    if not result.get('released'):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=result.get('message', "Cannot release lock owned by another user"),
        )
    broadcast_event(
        'DOCUMENT_UNLOCKED',
        {
            'document_id': str(inv.id),
            'released_by': user_handle,
        },
    )
    return result

@router.get('/api/invoices/{invoice_id}/lock/status')
@router.get('/api/documents/{invoice_id}/lock/status')
def get_document_lock_status(
    invoice_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Gets the current lock status of a document for the authenticated user.
    """
    inv = _verify_document_access(current_user, invoice_id, db)
    user_handle = (current_user.username or current_user.email or f"user_{current_user.id}").strip().lower()
    return lock_manager.get_lock_status(
        doc_id=str(inv.id),
        current_user_handle=user_handle,
    )