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
                # Invalid IP address in X-Real-IP header; fallback to direct peer IP
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
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        if 'Content-Security-Policy' not in response.headers:
            response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none';"
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
        enable_in_tests: bool = False,
    ):
        super().__init__(app)
        self.max_auth_requests = max_auth_requests
        self.window_seconds = window_seconds
        self.cleanup_interval = cleanup_interval_seconds
        self.enable_in_tests = enable_in_tests
        self.last_cleanup = time.time()
        # Dictionary of key -> List[float]
        self.requests: Dict[str, List[float]] = {}

    @property
    def auth_requests(self) -> Dict[str, List[float]]:
        return self.requests

    @auth_requests.setter
    def auth_requests(self, val: Dict[str, List[float]]):
        self.requests = val

    def prune_stale_ips(self, current_time: Optional[float] = None) -> int:
        """
        Scans all tracked keys, removing expired timestamps and deleting any
        keys that no longer have timestamps within the active sliding window.
        Returns the number of pruned entries.
        """
        now = current_time if current_time is not None else time.time()
        pruned_count = 0
        for key in list(self.requests.keys()):
            timestamps = self.requests.get(key, [])
            valid_timestamps = [t for t in timestamps if now - t < self.window_seconds]
            if valid_timestamps:
                self.requests[key] = valid_timestamps
            else:
                self.requests.pop(key, None)
                pruned_count += 1
        return pruned_count

    async def dispatch(self, request: Request, call_next):
        if (
            os.getenv("PYTEST_CURRENT_TEST")
            or os.getenv("TESTING") == "true"
            or os.getenv("E2E_TESTING") == "true"
        ) and not self.enable_in_tests and not getattr(request.state, "test_rate_limit", False):
            return await call_next(request)

        path = request.url.path
        limit: Optional[int] = None
        category = "general"

        # Categorize rate limits
        if (
            path.startswith('/api/auth/login')
            or path.startswith('/api/auth/token')
            or path.startswith('/api/auth/forgot-password')
            or path.startswith('/api/auth/reset-password')
        ):
            limit = self.max_auth_requests  # default 15/min
            category = "login"
        elif path.startswith('/api/auth/mfa'):
            limit = 15  # 15 OTP / MFA requests per min (OWASP-compliant; test runner bypasses via E2E_TESTING)
            category = "mfa"
        elif (
            path.startswith('/api/documents/upload')
            or path.startswith('/api/documents/batch-upload')
        ):
            limit = 60  # 60 uploads per min per IP
            category = "upload"
        elif (
            path.startswith('/api/integrations/v1/webhook')
            or path.startswith('/api/callbacks')
        ):
            limit = 60  # 60 webhooks per min per IP
            category = "webhook"

        if limit is not None:
            current_time = time.time()

            # Periodic cleanup across all tracked keys
            if current_time - self.last_cleanup >= self.cleanup_interval:
                self.prune_stale_ips(current_time)
                self.last_cleanup = current_time

            client_ip = resolve_client_ip(request)
            rate_key = f"{category}:{client_ip}"

            # Filter valid timestamps for this specific IP & category
            existing = self.requests.get(rate_key, [])
            valid_timestamps = [t for t in existing if current_time - t < self.window_seconds]

            if len(valid_timestamps) >= limit:
                # Update with active window (do not append extra timestamp)
                self.requests[rate_key] = valid_timestamps
                return Response(
                    content=f'{{"detail": "Rate limit exceeded for {category}. Please wait {self.window_seconds} seconds before trying again."}}',
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    media_type='application/json',
                    headers={'Retry-After': str(self.window_seconds)},
                )

            # Record attempt and update map
            valid_timestamps.append(current_time)
            self.requests[rate_key] = valid_timestamps

        return await call_next(request)


__all__ = [
    "SecurityHeadersMiddleware",
    "RateLimiterMiddleware",
    "resolve_client_ip",
    "is_trusted_proxy_ip",
    "DEFAULT_TRUSTED_PROXIES",
]