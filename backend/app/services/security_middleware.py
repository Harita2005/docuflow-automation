import time
from collections import defaultdict
from typing import Dict, List
from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

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

class RateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Sliding window in-memory rate limiter to prevent brute-force attacks and denial-of-service.
    Enforces strict rate limits on authentication endpoints.
    """

    def __init__(self, app, max_auth_requests: int=15, window_seconds: int=60):
        super().__init__(app)
        self.max_auth_requests = max_auth_requests
        self.window_seconds = window_seconds
        self.auth_requests: Dict[str, List[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith('/api/auth/login') or path.startswith('/api/auth/token'):
            client_ip = request.client.host if request.client else 'unknown'
            current_time = time.time()
            timestamps = self.auth_requests[client_ip]
            valid_timestamps = [t for t in timestamps if current_time - t < self.window_seconds]
            self.auth_requests[client_ip] = valid_timestamps
            if len(valid_timestamps) >= self.max_auth_requests:
                return Response(content='{"detail": "Too many login attempts. Please wait 60 seconds before trying again."}', status_code=status.HTTP_429_TOO_MANY_REQUESTS, media_type='application/json', headers={'Retry-After': str(self.window_seconds)})
            self.auth_requests[client_ip].append(current_time)
        return await call_next(request)