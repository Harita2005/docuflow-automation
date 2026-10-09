import logging
import socket
import ipaddress
import re
import urllib.parse
from typing import Optional
from fastapi import HTTPException

logger = logging.getLogger(__name__)

BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("::ffff:0:0/96"),
]

def is_ip_blocked(ip_str: str) -> bool:
    """
    Checks if a given IP address string falls in a blocked private/loopback/link-local network.
    Fails closed (returns True) if the IP format is invalid or ambiguous.
    """
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        # Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
        if hasattr(ip_obj, 'ipv4_mapped') and ip_obj.ipv4_mapped:
            ip_obj = ip_obj.ipv4_mapped

        if (ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local 
                or ip_obj.is_multicast or ip_obj.is_reserved or ip_obj.is_unspecified):
            return True
        for net in BLOCKED_IP_NETWORKS:
            if ip_obj in net:
                return True
        return False
    except ValueError as exc:
        logger.warning('Failed to parse IP %s, failing closed: %s', ip_str, exc)
        return True

def validate_and_reconstruct_url(url: str) -> str:
    """
    Validates target URL against SSRF (Server-Side Request Forgery) attacks.
    Ensures valid HTTP/HTTPS scheme, no embedded credentials, safe port range,
    and verifies target hostname does not resolve to private/loopback/link-local IPs.
    Fails closed on any DNS resolution error, private IP, or malformed structure.
    Returns a freshly reconstructed URL string to sanitize CodeQL taint tracking.
    """
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail='Invalid target URL specified.')
    
    url_clean = url.strip()
    try:
        parsed = urllib.parse.urlparse(url_clean)
    except Exception as parse_err:
        raise HTTPException(status_code=400, detail=f'Failed to parse target URL: {parse_err}')

    scheme = (parsed.scheme or '').lower()
    if scheme not in ('http', 'https'):
        raise HTTPException(status_code=400, detail='Invalid URL scheme. Only HTTP and HTTPS allowed.')

    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail='Embedded credentials in URL are prohibited.')

    hostname = parsed.hostname
    if not hostname or not re.match(r'^[a-zA-Z0-9.\-]+$', hostname):
        raise HTTPException(status_code=400, detail='Invalid hostname format.')

    low_host = hostname.lower()
    if low_host in ('localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'):
        raise HTTPException(status_code=400, detail='Untrusted target host: Loopback or metadata endpoint prohibited.')

    # Check direct IP addresses in hostname if it is an IP literal
    try:
        ip_direct = ipaddress.ip_address(low_host)
        if is_ip_blocked(str(ip_direct)):
            raise HTTPException(status_code=400, detail=f"Target host '{hostname}' is a prohibited private/internal IP.")
    except ValueError:
        # Not a raw IP address; will be resolved via DNS below
        pass

    # Check port bounds
    try:
        parsed_port = parsed.port
    except ValueError:
        raise HTTPException(status_code=400, detail='Invalid port range.')

    if parsed_port is not None:
        if not (1 <= parsed_port <= 65535):
            raise HTTPException(status_code=400, detail='Invalid port range.')

    # DNS Resolution & IP verification (fail-closed)
    target_port = parsed_port or (443 if scheme == 'https' else 80)
    try:
        addr_info = socket.getaddrinfo(hostname, target_port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        if not addr_info:
            raise HTTPException(status_code=400, detail=f"No DNS records found for host '{hostname}'.")

        for family, socktype, proto, canonname, sockaddr in addr_info:
            ip_addr = sockaddr[0]
            if is_ip_blocked(ip_addr):
                raise HTTPException(status_code=400, detail=f"Target host '{hostname}' resolves to internal IP ({ip_addr}).")
    except socket.gaierror as exc:
        logger.warning('SSRF DNS resolution failed for %s: %s', hostname, exc)
        raise HTTPException(status_code=400, detail=f"Target DNS resolution failed for '{hostname}'.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('SSRF validation error for %s: %s', hostname, exc)
        raise HTTPException(status_code=400, detail=f"SSRF validation failed for '{hostname}'.")

    port_str = f':{parsed.port}' if parsed.port else ''
    path_str = parsed.path if parsed.path else '/'
    clean_url = f'{scheme}://{hostname}{port_str}{path_str}'
    if parsed.query:
        clean_url += f'?{parsed.query}'
    return clean_url

def validate_safe_url(url: str) -> str:
    return validate_and_reconstruct_url(url)