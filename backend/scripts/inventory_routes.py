import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from app.main import app
from fastapi.routing import APIRoute

def main():
    # Collect routes
    inventory = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            methods = [m for m in route.methods if m != "HEAD"]
            path = route.path
            
            # Check dependencies
            deps = []
            for d in route.dependencies:
                dep_fn = d.dependency
                deps.append(getattr(dep_fn, "__name__", str(dep_fn)))
            
            # Check parameter dependencies
            for p in route.dependant.dependencies:
                dep_fn = p.call
                deps.append(getattr(dep_fn, "__name__", str(dep_fn)))

            deps_unique = sorted(list(set(deps)))

            # Check if intentionally public
            public_paths = [
                "/",
                "/health",
                "/api/health",
                "/api/auth/login",
                "/api/auth/mfa/send-otp",
                "/api/auth/mfa/verify",
                "/api/auth/mfa/verify-totp",
                "/api/auth/forgot-password",
                "/api/auth/reset-password",
                "/m2m/auth/login",
                "/api/integrations/v1/webhook/sap-callback",
                "/api/files/signed/{document_id}",
            ]
            is_public = "YES" if any(path == p or path.startswith("/docs") or path.startswith("/redoc") or path.startswith("/openapi") for p in public_paths) else "NO"
            
            inventory.append({
                "method": ",".join(methods),
                "path": path,
                "endpoint": route.endpoint.__name__,
                "all_deps": ", ".join(deps_unique) if deps_unique else "None",
                "is_public": is_public
            })

    print(f"Total APIRoutes scanned: {len(inventory)}")
    print(f"{'Method':<8} | {'Path':<55} | {'Dependencies':<40} | {'Public?'}")
    print("-" * 115)
    for item in sorted(inventory, key=lambda x: x['path']):
        print(f"{item['method']:<8} | {item['path']:<55} | {item['all_deps'][:38]:<40} | {item['is_public']}")

if __name__ == "__main__":
    main()
