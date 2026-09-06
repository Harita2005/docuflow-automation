import urllib.parse
import socket
import ipaddress
from fastapi import HTTPException

# Blacklisted metadata and special IP addresses
BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),       # Loopback
    ipaddress.ip_network("10.0.0.0/8"),        # Private IPv4 Class A
    ipaddress.ip_network("172.16.0.0/12"),     # Private IPv4 Class B
    ipaddress.ip_network("192.168.0.0/16"),    # Private IPv4 Class C
    ipaddress.ip_network("169.254.0.0/16"),    # Link-local / Cloud Metadata (AWS, Azure, GCP)
    ipaddress.ip_network("0.0.0.0/8"),         # Zero network
    ipaddress.ip_network("::1/128"),           # IPv6 Loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 Unique Local
    ipaddress.ip_network("fe80::/10"),         # IPv6 Link-local
]

def is_ip_blocked(ip_str: str) -> bool:
    """Checks if a given IP address string falls in a blocked private/loopback network."""
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_reserved:
            return True
        for net in BLOCKED_IP_NETWORKS:
            if ip_obj in net:
                return True
    except ValueError:
        pass
    return False

def validate_safe_url(url: str, allow_private: bool = False) -> str:
    """
    Validates target URL against SSRF (Server-Side Request Forgery) attacks.
    Ensures valid HTTP/HTTPS scheme and verifies target hostname does not resolve to private/internal IPs.
    """
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail="Invalid target URL specified.")

    parsed = urllib.parse.urlparse(url.strip())
    
    if parsed.scheme.lower() not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail="Invalid URL scheme. Only HTTP and HTTPS protocol endpoints are permitted."
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid target URL format: Hostname missing.")

    low_host = hostname.lower()
    if low_host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        if not allow_private:
            raise HTTPException(
                status_code=400,
                detail="Untrusted target host: Loopback or internal addresses are prohibited."
            )

    if not allow_private:
        try:
            addr_info = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), socket.AF_UNSPEC, socket.SOCK_STREAM)
            for family, socktype, proto, canonname, sockaddr in addr_info:
                ip_addr = sockaddr[0]
                if is_ip_blocked(ip_addr):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Untrusted target host: Domain '{hostname}' resolves to restricted internal IP address."
                    )
        except socket.gaierror:
            raise HTTPException(
                status_code=400,
                detail=f"Target URL host DNS resolution failed for '{hostname}'."
            )

    return url
