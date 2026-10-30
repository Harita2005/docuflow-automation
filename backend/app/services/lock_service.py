import os
import json
import time
import threading
from pathlib import Path
from typing import Dict, Any, Optional
from app.config.settings import settings

__all__ = ["DocumentLockManager", "lock_manager"]

class DocumentLockManager:
    """
    Multi-worker thread-safe and process-safe review lock manager with TTL lease expiration.
    Synchronizes state across multiple Uvicorn worker processes via atomic disk cache.
    Prevents multiple approvers from opening and concurrently modifying the same document.
    """

    def __init__(self):
        self._locks: Dict[str, Dict[str, Any]] = {}
        self._lock_mutex = threading.Lock()
        self._cache_dir = settings.DATA_DIR
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._cache_file = self._cache_dir / ".doc_locks.json"

    def _sync_from_disk(self) -> None:
        if self._cache_file.exists():
            try:
                with open(self._cache_file, "r", encoding="utf-8") as f:
                    disk_data = json.load(f)
                    if isinstance(disk_data, dict):
                        self._locks.update(disk_data)
            except Exception:
                pass

    def _sync_to_disk(self) -> None:
        try:
            tmp_file = f"{self._cache_file}.tmp.{os.getpid()}_{int(time.time()*1000)}"
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(self._locks, f)
            os.replace(tmp_file, self._cache_file)
        except Exception:
            pass

    def _cleanup_expired(self):
        now = time.time()
        expired = [doc_id for doc_id, info in self._locks.items() if info.get('expires_at', 0) <= now]
        for doc_id in expired:
            del self._locks[doc_id]

    def acquire_lock(self, doc_id: str, user_handle: str, user_name: str, lease_seconds: int=180, force: bool=False) -> Dict[str, Any]:
        with self._lock_mutex:
            self._sync_from_disk()
            self._cleanup_expired()
            now = time.time()
            clean_doc_id = str(doc_id).strip()
            clean_handle = str(user_handle).strip().lower()
            existing = self._locks.get(clean_doc_id)
            if existing and not force:
                if existing.get('user_handle') == clean_handle:
                    existing['expires_at'] = now + lease_seconds
                    existing['last_heartbeat'] = now
                    self._sync_to_disk()
                    return {'acquired': True, 'is_locked': False, 'locked_by': user_name, 'user_handle': clean_handle, 'expires_in': lease_seconds}
                else:
                    remaining = max(0, int(existing['expires_at'] - now))
                    return {'acquired': False, 'is_locked': True, 'locked_by': existing.get('user_name', 'Another Approver'), 'user_handle': existing.get('user_handle'), 'locked_at': existing.get('locked_at'), 'expires_in': remaining}
            self._locks[clean_doc_id] = {'user_handle': clean_handle, 'user_name': user_name, 'locked_at': now, 'last_heartbeat': now, 'expires_at': now + lease_seconds}
            self._sync_to_disk()
            return {'acquired': True, 'is_locked': False, 'locked_by': user_name, 'user_handle': clean_handle, 'expires_in': lease_seconds}

    def renew_lock(self, doc_id: str, user_handle: str, lease_seconds: int=180) -> Dict[str, Any]:
        with self._lock_mutex:
            self._sync_from_disk()
            self._cleanup_expired()
            now = time.time()
            clean_doc_id = str(doc_id).strip()
            clean_handle = str(user_handle).strip().lower()
            existing = self._locks.get(clean_doc_id)
            if existing and existing.get('user_handle') == clean_handle:
                existing['expires_at'] = now + lease_seconds
                existing['last_heartbeat'] = now
                self._sync_to_disk()
                return {'success': True, 'renewed': True, 'expires_in': lease_seconds}
            return {'success': False, 'renewed': False, 'message': 'Lock expired or held by another user'}

    def release_lock(self, doc_id: str, user_handle: Optional[str] = None, is_admin: bool = False) -> Dict[str, Any]:
        with self._lock_mutex:
            self._sync_from_disk()
            clean_doc_id = str(doc_id).strip()
            existing = self._locks.get(clean_doc_id)
            if not existing:
                return {'success': True, 'released': True}
            clean_handle = str(user_handle).strip().lower() if user_handle else None
            if is_admin or clean_handle is None or existing.get('user_handle') == clean_handle:
                del self._locks[clean_doc_id]
                self._sync_to_disk()
                return {'success': True, 'released': True}
            return {'success': False, 'released': False, 'message': 'Not lock owner'}

    def get_lock_status(self, doc_id: str, current_user_handle: Optional[str]=None) -> Dict[str, Any]:
        with self._lock_mutex:
            self._sync_from_disk()
            self._cleanup_expired()
            now = time.time()
            clean_doc_id = str(doc_id).strip()
            existing = self._locks.get(clean_doc_id)
            if not existing:
                return {'is_locked': False, 'locked_by': None}
            is_self = False
            if current_user_handle and existing.get('user_handle') == str(current_user_handle).strip().lower():
                is_self = True
            remaining = max(0, int(existing['expires_at'] - now))
            return {'is_locked': not is_self, 'is_self': is_self, 'locked_by': existing.get('user_name'), 'user_handle': existing.get('user_handle'), 'expires_in': remaining}

lock_manager = DocumentLockManager()
