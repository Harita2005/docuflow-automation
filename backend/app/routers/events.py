import logging
import asyncio
import json
import time
import threading
import secrets
from typing import Set, Optional, Any, Dict
from fastapi import APIRouter, Request, Query, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database.connection import get_db, SessionLocal
from app.database.models import User
from app.auth import get_current_active_user, decode_token
from app.services.rbac_service import authorize_document_access
from app.routers.documents import find_invoice_by_identifier, is_user_in_approver_pool
from app.services.lock_service import lock_manager
from jose import JWTError

logger = logging.getLogger(__name__)
router = APIRouter(tags=['Real-Time Events & Collision Locks'])

# ---------------------------------------------------------------------------
# Stream Ticket Manager (Short-lived, single-use ticket to prevent JWT in URL)
# ---------------------------------------------------------------------------
class StreamTicketManager:
    """
    Manages short-lived (30s) single-use tickets for establishing SSE connections.
    Avoids putting long-lived JWT access tokens in URLs, browser history, or server access logs.
    """
    def __init__(self, ttl_seconds: int = 30):
        self._tickets: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds

    def _cleanup_expired(self):
        now = time.time()
        expired = [k for k, v in self._tickets.items() if v.get("expires_at", 0) <= now]
        for k in expired:
            del self._tickets[k]

    def create_ticket(self, user: User) -> str:
        with self._lock:
            self._cleanup_expired()
            ticket = secrets.token_urlsafe(32)
            self._tickets[ticket] = {
                "user_id": user.id,
                "username": (user.username or "").strip().lower(),
                "expires_at": time.time() + self._ttl,
            }
            return ticket

    def consume_ticket(self, ticket: str) -> Optional[int]:
        """Consumes a ticket in a single-use manner."""
        with self._lock:
            self._cleanup_expired()
            info = self._tickets.pop(ticket, None)
            if not info:
                return None
            if info.get("expires_at", 0) < time.time():
                return None
            return info.get("user_id")

stream_ticket_manager = StreamTicketManager(ttl_seconds=30)

# ---------------------------------------------------------------------------
# SSE Listener with User Context
# ---------------------------------------------------------------------------
class SSEListener:
    def __init__(self, queue: asyncio.Queue, user: User):
        self.queue = queue
        self.user = user
        self.user_id = getattr(user, 'id', None)
        self.username = (getattr(user, 'username', '') or '').strip().lower()
        self.is_admin = _is_admin_user(user)

    def __hash__(self):
        return hash(id(self.queue))

    def __eq__(self, other):
        return isinstance(other, SSEListener) and id(self.queue) == id(other.queue)

_active_listeners: Set[SSEListener] = set()
_listeners_mutex = threading.Lock()

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
    u_role = (getattr(user, 'role', '') or "").strip().lower()
    return (
        u_role in {"admin", "administrator", "system_admin", "superadmin"}
        or getattr(user, "is_superuser", False)
    )

def _verify_document_access(user: User, doc_id: str, db: Session):
    inv = find_invoice_by_identifier(db, doc_id)
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
    if _is_admin_user(user):
        return inv
    user_div = (getattr(user, 'division', '') or '').strip().upper()
    doc_div = (getattr(inv, 'division', '') or '').strip().upper()
    if user_div and doc_div and user_div not in {"HQ", "GLOBAL", "ALL"} and doc_div != user_div:
        raise HTTPException(status_code=403, detail="Access Denied: You are not authorized to access this document")
    if not authorize_document_access(user, inv) and not is_user_in_approver_pool(user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail="Access Denied: You are not authorized to access this document")
    return inv

def _get_active_db_session(passed_db: Optional[Session] = None):
    if passed_db is not None:
        return passed_db, False
    from app.main import app
    override = app.dependency_overrides.get(get_db)
    if override:
        gen = override()
        if hasattr(gen, '__next__'):
            return next(gen), False
        return gen, False
    return SessionLocal(), True

def broadcast_event(event_type: str, payload: dict, db: Optional[Session] = None):
    """
    Broadcasts a real-time event via SSE, strictly filtering events
    based on each connected user's document access rights and session target.
    """
    with _listeners_mutex:
        active_list = list(_active_listeners)
    if not active_list:
        return

    event_data = {'type': event_type, 'payload': payload, 'timestamp': time.time()}
    encoded = f'data: {json.dumps(event_data)}\n\n'
    dead_listeners = set()

    # 1. Target user-specific session notifications (SESSION_KICKED)
    if event_type == 'SESSION_KICKED':
        target_uid = payload.get('user_id')
        target_uname = str(payload.get('username') or '').strip().lower()
        for listener in active_list:
            if (target_uid is not None and listener.user_id == target_uid) or (target_uname and listener.username == target_uname):
                try:
                    listener.queue.put_nowait(encoded)
                except Exception:
                    dead_listeners.add(listener)
        if dead_listeners:
            with _listeners_mutex:
                _active_listeners.difference_update(dead_listeners)
        return

    # 2. Document-scoped events: filter per user's document access
    doc_id = payload.get('document_id')
    if doc_id:
        doc = None
        session, should_close = _get_active_db_session(db)
        try:
            try:
                doc = find_invoice_by_identifier(session, str(doc_id))
            except Exception:
                from app.database.models import Document
                doc = session.query(Document).filter(Document.id == str(doc_id)).first()

            for listener in active_list:
                # Administrators receive all document events
                if listener.is_admin:
                    try:
                        listener.queue.put_nowait(encoded)
                    except Exception:
                        dead_listeners.add(listener)
                    continue

                # Normal users: evaluate object-level document access
                if doc:
                    user_div = (getattr(listener.user, 'division', '') or '').strip().upper()
                    doc_div = (getattr(doc, 'division', '') or '').strip().upper()
                    if user_div and doc_div and user_div not in {"HQ", "GLOBAL", "ALL"} and doc_div != user_div:
                        has_access = False
                    else:
                        try:
                            has_access = (
                                authorize_document_access(listener.user, doc)
                                or is_user_in_approver_pool(listener.user, doc.assigned_approver, db=session)
                            )
                        except Exception as err:
                            logger.debug("Access check failed during event broadcast: %s", err)
                            has_access = False

                    if has_access:
                        try:
                            listener.queue.put_nowait(encoded)
                        except Exception:
                            dead_listeners.add(listener)
        finally:
            if should_close:
                session.close()

        if dead_listeners:
            with _listeners_mutex:
                _active_listeners.difference_update(dead_listeners)
        return

    # 3. Global non-sensitive system events (no doc_id, not SESSION_KICKED)
    for listener in active_list:
        try:
            listener.queue.put_nowait(encoded)
        except Exception:
            dead_listeners.add(listener)

    if dead_listeners:
        with _listeners_mutex:
            _active_listeners.difference_update(dead_listeners)

def get_current_user_for_stream(
    request: Request,
    ticket: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    access_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> User:
    """
    Authenticates the SSE connection via either:
    1. Authorization: Bearer <token> header (e.g. fetch-based stream).
    2. Short-lived single-use stream ticket (e.g. EventSource ?ticket=...).
    Explicitly prohibits passing JWT in query parameters.
    """
    # 1. Prohibit JWT in query parameters
    if token or access_token or request.query_params.get("jwt") or request.query_params.get("token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passing authentication tokens in URL query parameters is forbidden. Use the Authorization header or request a stream ticket.",
        )

    # 2. Check Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header:
        scheme, _, creds = auth_header.partition(" ")
        if scheme.lower() == "bearer" and creds:
            try:
                payload = decode_token(creds)
                username = payload.get("sub") or payload.get("username")
                if username:
                    user = (
                        db.query(User)
                        .filter(
                            (User.username == username)
                            | (User.email == username)
                            | (User.employee_id == username)
                        )
                        .filter(User.is_deleted == False)
                        .first()
                    )
                    if not user:
                        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
                    if not user.is_active:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is deactivated")
                    return user
            except (JWTError, Exception) as exc:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    # 3. Check single-use stream ticket
    if ticket:
        user_id = stream_ticket_manager.consume_ticket(ticket)
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired stream ticket")
        user = db.query(User).filter(User.id == user_id, User.is_deleted == False).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is deactivated")
        return user

    # 4. Neither header nor ticket provided
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required: Provide an Authorization header or a valid stream ticket",
    )

@router.post('/api/events/stream-ticket')
def issue_stream_ticket(
    current_user: User = Depends(get_current_active_user),
):
    """
    Issues a short-lived (30s) single-use ticket for connecting to the SSE stream.
    Prevents leaking long-lived JWT access tokens in URLs or browser histories.
    """
    ticket = stream_ticket_manager.create_ticket(current_user)
    return {"ticket": ticket, "expires_in": 30}

@router.get('/api/events/stream')
async def event_stream(
    request: Request,
    current_user: User = Depends(get_current_user_for_stream),
):
    """
    Server-Sent Events (SSE) endpoint.
    Subscribes the browser client to real-time workflow events, document updates, and lock changes.
    All events are strictly filtered according to the authenticated user's access boundaries.
    """
    queue: asyncio.Queue = asyncio.Queue()
    listener = SSEListener(queue, current_user)
    with _listeners_mutex:
        _active_listeners.add(listener)

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
            with _listeners_mutex:
                _active_listeners.discard(listener)

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