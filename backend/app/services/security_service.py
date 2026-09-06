import urllib.parse
import socket
import ipaddress
import re
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

def validate_and_reconstruct_url(url: str) -> str:
    """
    Validates target URL against SSRF (Server-Side Request Forgery) attacks.
    Ensures valid HTTP/HTTPS scheme and verifies target hostname does not resolve to private/internal IPs.
    Returns a freshly reconstructed URL string to sanitize CodeQL taint tracking.
    """
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail="Invalid target URL specified.")

    parsed = urllib.parse.urlparse(url.strip())
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme. Only HTTP and HTTPS allowed.")

    hostname = parsed.hostname
    if not hostname or not re.match(r'^[a-zA-Z0-9\.\-]+$', hostname):
        raise HTTPException(status_code=400, detail="Invalid hostname format.")

    low_host = hostname.lower()
    if low_host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        raise HTTPException(status_code=400, detail="Untrusted target host: Loopback prohibited.")

    try:
        addr_info = socket.getaddrinfo(hostname, parsed.port or (443 if scheme == "https" else 80), socket.AF_UNSPEC, socket.SOCK_STREAM)
        for family, socktype, proto, canonname, sockaddr in addr_info:
            ip_addr = sockaddr[0]
            if is_ip_blocked(ip_addr):
                raise HTTPException(status_code=400, detail=f"Target host '{hostname}' resolves to internal IP.")
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Target DNS resolution failed for '{hostname}'.")

    port_str = f":{parsed.port}" if parsed.port else ""
    clean_url = f"{scheme}://{hostname}{port_str}{parsed.path}"
    if parsed.query:
        clean_url += f"?{parsed.query}"
    return clean_url

def validate_safe_url(url: str) -> str:
    return validate_and_reconstruct_url(url)
