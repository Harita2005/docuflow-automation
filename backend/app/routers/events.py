import asyncio
import json
import time
from typing import Set, Optional
from fastapi import APIRouter, Request, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.services.lock_service import lock_manager
from app.database import get_db

router = APIRouter(tags=["Real-Time Events & Collision Locks"])

# Active SSE connection listeners
_active_listeners: Set[asyncio.Queue] = set()

def broadcast_event(event_type: str, payload: dict):
    """
    Broadcasts a real-time event to all connected web clients via SSE.
    """
    event_data = {
        "type": event_type,
        "payload": payload,
        "timestamp": time.time()
    }
    encoded = f"data: {json.dumps(event_data)}\n\n"
    
    # Push to all active queues
    dead_queues = set()
    for q in _active_listeners:
        try:
            q.put_nowait(encoded)
        except Exception:
            dead_queues.add(q)
    for dq in dead_queues:
        _active_listeners.discard(dq)

@router.get("/api/events/stream")
async def event_stream(request: Request):
    """
    Server-Sent Events (SSE) endpoint.
    Subscribes the browser client to real-time workflow events, document updates, and lock changes.
    """
    queue: asyncio.Queue = asyncio.Queue()
    _active_listeners.add(queue)

    async def event_generator():
        try:
            # Send initial handshake event
            yield f"data: {json.dumps({'type': 'CONNECTED', 'message': 'DocuFlow Real-Time Stream Connected'})}\n\n"
            
            while True:
                if await request.is_disconnected():
                    break
                try:
                    # Wait up to 15s for new message, then send ping heartbeat
                    message = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield message
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            _active_listeners.discard(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# =========================================================================
# DOCUMENT REVIEW COLLISION LOCK API
# =========================================================================

@router.post("/api/invoices/{invoice_id}/lock/acquire")
@router.post("/api/documents/{invoice_id}/lock/acquire")
def acquire_document_lock(invoice_id: str, payload: dict):
    """
    Acquires an exclusive review lock on a document for the current user.
    """
    user_handle = payload.get("user_handle") or payload.get("username") or "unknown"
    user_name = payload.get("user_name") or payload.get("name") or user_handle
    lease_seconds = int(payload.get("lease_seconds") or 180)

    result = lock_manager.acquire_lock(
        doc_id=invoice_id,
        user_handle=user_handle,
        user_name=user_name,
        lease_seconds=lease_seconds
    )
    
    # Broadcast lock state change
    if result.get("acquired"):
        broadcast_event("DOCUMENT_LOCKED", {
            "document_id": invoice_id,
            "locked_by": user_name,
            "user_handle": user_handle,
            "expires_in": lease_seconds
        })

    return result

@router.post("/api/invoices/{invoice_id}/lock/heartbeat")
@router.post("/api/documents/{invoice_id}/lock/heartbeat")
def renew_document_lock(invoice_id: str, payload: dict):
    """
    Renews the active review lock lease.
    """
    user_handle = payload.get("user_handle") or payload.get("username") or ""
    lease_seconds = int(payload.get("lease_seconds") or 180)
    return lock_manager.renew_lock(doc_id=invoice_id, user_handle=user_handle, lease_seconds=lease_seconds)

@router.post("/api/invoices/{invoice_id}/lock/release")
@router.post("/api/documents/{invoice_id}/lock/release")
def release_document_lock(invoice_id: str, payload: dict = None):
    """
    Releases the review lock on a document.
    """
    user_handle = payload.get("user_handle") if payload else None
    result = lock_manager.release_lock(doc_id=invoice_id, user_handle=user_handle)
    
    broadcast_event("DOCUMENT_UNLOCKED", {
        "document_id": invoice_id,
        "released_by": user_handle
    })
    return result

@router.get("/api/invoices/{invoice_id}/lock/status")
@router.get("/api/documents/{invoice_id}/lock/status")
def get_document_lock_status(invoice_id: str, user_handle: Optional[str] = Query(None)):
    """
    Gets the current lock status of a document.
    """
    return lock_manager.get_lock_status(doc_id=invoice_id, current_user_handle=user_handle)
