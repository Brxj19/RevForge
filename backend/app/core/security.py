from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

password_hasher = PasswordHasher()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> str:
    normalized = normalize_email(email)
    if not EMAIL_RE.match(normalized):
        raise ValueError("Enter a valid email address.")
    return normalized


def validate_slug(slug: str) -> str:
    normalized = slug.strip().lower()
    if not normalized or not SLUG_RE.match(normalized):
        raise ValueError("Use lowercase letters, numbers, and single hyphens for slugs.")
    return normalized


def validate_display_name(value: str, *, field_name: str = "display name") -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name.capitalize()} cannot be empty.")
    return normalized


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def validate_password_strength(password: str, minimum_length: int) -> None:
    if len(password) < minimum_length:
        raise ValueError(f"Password must be at least {minimum_length} characters long.")
    if (
        password.lower() == password
        or password.upper() == password
        or not any(ch.isdigit() for ch in password)
    ):
        raise ValueError("Password must include a mix of letters and numbers.")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def create_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def digest_token(secret_key: str, token: str) -> str:
    return hmac.new(secret_key.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


SUPPORTED_SSH_KEY_TYPES = {
    "ssh-ed25519",
    "ssh-rsa",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
}


def normalize_ssh_public_key(public_key: str) -> tuple[str, str, str | None]:
    normalized = " ".join(public_key.strip().split())
    parts = normalized.split(" ", 2)
    if len(parts) < 2 or len(parts) > 3:
        raise ValueError("Enter a valid SSH public key.")
    key_type, key_body = parts[0], parts[1]
    if key_type not in SUPPORTED_SSH_KEY_TYPES:
        raise ValueError("Unsupported SSH public key type.")
    try:
        key_bytes = base64.b64decode(key_body.encode("ascii"), validate=True)
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError("Enter a valid SSH public key.") from exc
    if not key_bytes:
        raise ValueError("Enter a valid SSH public key.")
    comment = parts[2] if len(parts) == 3 else None
    if comment is not None and not comment.strip():
        comment = None
    return (
        key_type,
        f"{key_type} {key_body}" if comment is None else f"{key_type} {key_body} {comment}",
        comment,
    )


def fingerprint_ssh_public_key(public_key: str) -> str:
    _, normalized, _comment = normalize_ssh_public_key(public_key)
    key_body = normalized.split(" ", 2)[1]
    key_bytes = base64.b64decode(key_body.encode("ascii"), validate=True)
    digest = hashlib.sha256(key_bytes).digest()
    return "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")


def utc_now() -> datetime:
    return datetime.now(UTC)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def session_expiry(minutes: int) -> datetime:
    return utc_now() + timedelta(minutes=minutes)
