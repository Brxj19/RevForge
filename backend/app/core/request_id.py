"""Request-id validation shared by the API middleware, both Mercurial gateways and hooks (I15).

A client-supplied id is only an attribution aid: it is accepted when it matches a short,
conservative character set and is otherwise replaced by a server-generated uuid4. It is
never used as an idempotency key.
"""

from __future__ import annotations

import re
from uuid import uuid4

REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


def safe_request_id(value: str | bytes | None) -> str:
    """Return ``value`` if it is a well-formed request id, else a fresh server uuid4."""
    if isinstance(value, bytes):
        try:
            value = value.decode("ascii")
        except UnicodeDecodeError:
            value = None
    if value and REQUEST_ID_RE.fullmatch(value):
        return value
    return str(uuid4())
