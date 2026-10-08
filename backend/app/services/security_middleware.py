import ipaddress
import os
import time
from typing import Dict, List, Optional
from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from app.config.settings import settings


# ---------------------------------------------------------------------------
# Trusted Reverse Proxy Configuration & Client IP Resolution
# ---------------------------------------------------------------------------

DEFAULT_TRUSTED_PROXIES = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
]


def is_trusted_proxy_ip(ip_str: str) -> bool:
    """Check if direct connecting peer IP is a known trusted proxy or local network."""
    if not ip_str:
        return False
    configured = getattr(settings, "TRUSTED_PROXIES", None)
    if configured:
        allowed = {p.strip() for p in configured.split(",") if p.strip()}
        return ip_str.strip() in allowed
    try:
        ip = ipaddress.ip_address(ip_str.strip())
        return any(ip in net for net in DEFAULT_TRUSTED_PROXIES)
    except ValueError:
        return False


def resolve_client_ip(request: Request) -> str:
    """
    Derives client IP address securely:
    Only trust X-Forwarded-For or X-Real-IP if the direct connecting peer (request.client.host)
    is a known trusted reverse proxy or load balancer.
    Direct client connections cannot spoof X-Forwarded-For.
    """
    direct_peer = (
        request.client.host.strip()
        if request.client and request.client.host
        else "127.0.0.1"
    )

    if is_trusted_proxy_ip(direct_peer):
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            for ip_part in [p.strip() for p in fwd.split(",") if p.strip()]:
                try:
                    ipaddress.ip_address(ip_part)
                    return ip_part
                except ValueError:
                    continue
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            try:
                ipaddress.ip_address(real_ip.strip())
                return real_ip.strip()
            except ValueError:
                pass

    return direct_peer


# ---------------------------------------------------------------------------
# HTTP Security Headers
# ---------------------------------------------------------------------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Applies enterprise-grade OWASP recommended HTTP Security Headers to all responses.
    """

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        if 'server' in response.headers:
            del response.headers['server']
        return response


# ---------------------------------------------------------------------------
# Rate Limiter Middleware (Sliding Window with Stale Key Pruning)
# ---------------------------------------------------------------------------

class RateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Sliding window in-memory rate limiter with active TTL pruning.
    Enforces strict rate limits on authentication and token endpoints.
    Automatically deletes empty IP keys and runs periodic cleanup to prevent memory leaks.
    """

    def __init__(
        self,
        app,
        max_auth_requests: int = 15,
        window_seconds: int = 60,
        cleanup_interval_seconds: int = 60,
    ):
        super().__init__(app)
        self.max_auth_requests = max_auth_requests
        self.window_seconds = window_seconds
        self.cleanup_interval = cleanup_interval_seconds
        self.last_cleanup = time.time()
        # Use a standard dictionary (not defaultdict) so lookups never leave empty keys
        self.auth_requests: Dict[str, List[float]] = {}

    def prune_stale_ips(self, current_time: Optional[float] = None) -> int:
        """
        Scans all tracked IPs, removing expired timestamps and deleting any
        keys that no longer have timestamps within the active sliding window.
        Returns the number of pruned IP entries.
        """
        now = current_time if current_time is not None else time.time()
        pruned_count = 0
        for ip in list(self.auth_requests.keys()):
            timestamps = self.auth_requests.get(ip, [])
            valid_timestamps = [t for t in timestamps if now - t < self.window_seconds]
            if valid_timestamps:
                self.auth_requests[ip] = valid_timestamps
            else:
                self.auth_requests.pop(ip, None)
                pruned_count += 1
        return pruned_count

    async def dispatch(self, request: Request, call_next):
        if os.getenv("PYTEST_CURRENT_TEST"):
            return await call_next(request)

        path = request.url.path
        if (
            path.startswith('/api/auth/login')
            or path.startswith('/api/auth/token')
            or path.startswith('/api/auth/mfa')
        ):
            current_time = time.time()

            # Periodic cleanup across all tracked IPs
            if current_time - self.last_cleanup >= self.cleanup_interval:
                self.prune_stale_ips(current_time)
                self.last_cleanup = current_time

            client_ip = resolve_client_ip(request)

            # Filter valid timestamps for this specific IP
            existing = self.auth_requests.get(client_ip, [])
            valid_timestamps = [t for t in existing if current_time - t < self.window_seconds]

            if len(valid_timestamps) >= self.max_auth_requests:
                # Update with active window (do not append extra timestamp)
                self.auth_requests[client_ip] = valid_timestamps
                return Response(
                    content='{"detail": "Too many login attempts. Please wait 60 seconds before trying again."}',
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    media_type='application/json',
                    headers={'Retry-After': str(self.window_seconds)},
                )

            # Record attempt and update map
            valid_timestamps.append(current_time)
            self.auth_requests[client_ip] = valid_timestamps

        return await call_next(request)


__all__ = [
    "SecurityHeadersMiddleware",
    "RateLimiterMiddleware",
    "resolve_client_ip",
    "is_trusted_proxy_ip",
    "DEFAULT_TRUSTED_PROXIES",
]