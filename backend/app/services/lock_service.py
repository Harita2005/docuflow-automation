import time
import threading
from typing import Dict, Any, Optional

class DocumentLockManager:
    """
    Thread-safe in-memory review lock manager with TTL lease expiration.
    Prevents multiple approvers from opening and concurrently modifying the same document.
    """
    def __init__(self):
        self._locks: Dict[str, Dict[str, Any]] = {}
        self._lock_mutex = threading.Lock()

    def _cleanup_expired(self):
        now = time.time()
        expired = [doc_id for doc_id, info in self._locks.items() if info.get("expires_at", 0) <= now]
        for doc_id in expired:
            del self._locks[doc_id]

    def acquire_lock(
        self, 
        doc_id: str, 
        user_handle: str, 
        user_name: str, 
        lease_seconds: int = 180
    ) -> Dict[str, Any]:
        with self._lock_mutex:
            self._cleanup_expired()
            now = time.time()
            clean_doc_id = str(doc_id).strip()
            clean_handle = str(user_handle).strip().lower()

            existing = self._locks.get(clean_doc_id)
            if existing:
                # If already held by the same user, extend lease
                if existing.get("user_handle") == clean_handle:
                    existing["expires_at"] = now + lease_seconds
                    existing["last_heartbeat"] = now
                    return {
                        "acquired": True,
                        "is_locked": False,
                        "locked_by": user_name,
                        "user_handle": clean_handle,
                        "expires_in": lease_seconds
                    }
                else:
                    # Locked by another user
                    remaining = max(0, int(existing["expires_at"] - now))
                    return {
                        "acquired": False,
                        "is_locked": True,
                        "locked_by": existing.get("user_name", "Another Approver"),
                        "user_handle": existing.get("user_handle"),
                        "locked_at": existing.get("locked_at"),
                        "expires_in": remaining
                    }

            # Grant new lock
            self._locks[clean_doc_id] = {
                "user_handle": clean_handle,
                "user_name": user_name,
                "locked_at": now,
                "last_heartbeat": now,
                "expires_at": now + lease_seconds
            }
            return {
                "acquired": True,
                "is_locked": False,
                "locked_by": user_name,
                "user_handle": clean_handle,
                "expires_in": lease_seconds
            }

    def renew_lock(self, doc_id: str, user_handle: str, lease_seconds: int = 180) -> Dict[str, Any]:
        with self._lock_mutex:
            self._cleanup_expired()
            now = time.time()
            clean_doc_id = str(doc_id).strip()
            clean_handle = str(user_handle).strip().lower()

            existing = self._locks.get(clean_doc_id)
            if existing and existing.get("user_handle") == clean_handle:
                existing["expires_at"] = now + lease_seconds
                existing["last_heartbeat"] = now
                return {
                    "success": True,
                    "renewed": True,
                    "expires_in": lease_seconds
                }
            return {
                "success": False,
                "renewed": False,
                "message": "Lock expired or held by another user"
            }

    def release_lock(self, doc_id: str, user_handle: Optional[str] = None) -> Dict[str, Any]:
        with self._lock_mutex:
            clean_doc_id = str(doc_id).strip()
            existing = self._locks.get(clean_doc_id)
            if not existing:
                return {"success": True, "released": True}

            if user_handle is None or existing.get("user_handle") == str(user_handle).strip().lower():
                del self._locks[clean_doc_id]
                return {"success": True, "released": True}

            return {"success": False, "released": False, "message": "Not lock owner"}

    def get_lock_status(self, doc_id: str, current_user_handle: Optional[str] = None) -> Dict[str, Any]:
        with self._lock_mutex:
            self._cleanup_expired()
            now = time.time()
            clean_doc_id = str(doc_id).strip()
            existing = self._locks.get(clean_doc_id)

            if not existing:
                return {"is_locked": False, "locked_by": None}

            is_self = False
            if current_user_handle and existing.get("user_handle") == str(current_user_handle).strip().lower():
                is_self = True

            remaining = max(0, int(existing["expires_at"] - now))
            return {
                "is_locked": not is_self,
                "is_self": is_self,
                "locked_by": existing.get("user_name"),
                "user_handle": existing.get("user_handle"),
                "expires_in": remaining
            }

# Global singleton lock manager instance
lock_manager = DocumentLockManager()
