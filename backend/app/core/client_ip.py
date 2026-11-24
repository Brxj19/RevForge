from __future__ import annotations

import ipaddress

from fastapi import Request

from app.core.config import Settings

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


def _normalize_ip(raw: str) -> IPAddress | None:
    cleaned = raw.strip()
    if not cleaned:
        return None
    try:
        addr = ipaddress.ip_address(cleaned)
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        return addr.ipv4_mapped
    return addr


def _is_trusted(addr: IPAddress, networks: tuple[IPNetwork, ...]) -> bool:
    return any(addr.version == net.version and addr in net for net in networks)


def resolve_client_ip(request: Request, settings: Settings) -> str:
    """Resolve the effective client IP without trusting spoofed forwarding headers.

    ``X-Forwarded-For`` is only consulted when the direct socket peer belongs to
    ``settings.trusted_proxy_cidrs``. When trusted, we walk ``X-Forwarded-For`` from
    right to left, skipping trusted proxy hops, and return the rightmost untrusted IP.
    """
    peer_raw = request.client.host if request.client is not None else "unknown"
    peer_addr = _normalize_ip(peer_raw)
    if peer_addr is None:
        return peer_raw

    peer_str = str(peer_addr)
    trusted_networks = settings.parsed_trusted_proxy_networks
    if not trusted_networks or not _is_trusted(peer_addr, trusted_networks):
        return peer_str

    if hasattr(request.headers, "getlist"):
        raw_headers = request.headers.getlist("x-forwarded-for")
    else:
        single = request.headers.get("x-forwarded-for")
        raw_headers = [single] if single else []
    if not raw_headers:
        return peer_str

    hops = [part.strip() for hdr in raw_headers for part in hdr.split(",") if hdr.strip()]
    if not hops:
        return peer_str
    for hop in reversed(hops):
        hop_addr = _normalize_ip(hop)
        if hop_addr is None:
            # Malformed hop on the trusted edge: refuse to walk further left.
            return peer_str
        if not _is_trusted(hop_addr, trusted_networks):
            return str(hop_addr)

    return peer_str
