from __future__ import annotations

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


def utc_now() -> datetime:
    return datetime.now(UTC)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def session_expiry(minutes: int) -> datetime:
    return utc_now() + timedelta(minutes=minutes)
