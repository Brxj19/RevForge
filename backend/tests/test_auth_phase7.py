from __future__ import annotations

import asyncio
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.client_ip import resolve_client_ip
from app.core.config import get_settings
from app.core.security import ensure_utc, utc_now
from app.models.audit_event import AuditEvent
from app.models.auth_token import EmailVerificationToken, PasswordResetToken
from app.models.break_glass_session import BreakGlassSession
from app.models.organization import Organization
from app.models.repository import Repository
from app.models.user import User
from app.models.user_password_credential import UserPasswordCredential
from app.models.user_session import UserSession
from app.services import authentication as auth_service
from tests.auth_helpers import in_memory_email_sender, register_and_login

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}
PASSWORD = "StrongPassword123"


def _csrf(client: TestClient) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN_HEADERS}


def _run_async(session_factory: async_sessionmaker[AsyncSession], callback):
    async def runner():
        async with session_factory() as session:
            return await callback(session)

    return asyncio.run(runner())


# ---------------------------------------------------------------------------
# I3: Constant-time login dummy verification, post-verify status checks, malformed hash
# ---------------------------------------------------------------------------


def test_i3_unknown_email_invokes_dummy_argon2_verify(client: TestClient) -> None:
    calls: list[tuple[str, str]] = []
    real_verify = auth_service.verify_password

    def spy_verify(stored_hash: str, password: str) -> bool:
        calls.append((stored_hash, password))
        return real_verify(stored_hash, password)

    with patch.object(auth_service, "verify_password", side_effect=spy_verify):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@example.com", "password": "SomePassword123"},
        )

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"
    assert len(calls) == 1


def test_i3_suspended_user_checks_password_before_revealing_suspension(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    register_and_login(client, email="sus@example.com", display_name="Sus User", password=PASSWORD)
    client.cookies.clear()

    async def suspend(session: AsyncSession) -> None:
        user = await session.scalar(select(User).where(User.email == "sus@example.com"))
        assert user is not None
        user.is_active = False
        user.suspended_at = utc_now()
        user.suspended_reason = "CONFIDENTIAL INCIDENT-999"
        await session.commit()

    _run_async(session_factory, suspend)

    # Wrong password MUST return 401 invalid_credentials (never reveal suspension)
    wrong = client.post(
        "/api/v1/auth/login",
        json={"email": "sus@example.com", "password": "WrongPassword123"},
    )
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "invalid_credentials"
    assert "CONFIDENTIAL" not in wrong.text

    # Right password returns 403 account_suspended without leaking reason or setting cookies
    right = client.post(
        "/api/v1/auth/login",
        json={"email": "sus@example.com", "password": PASSWORD},
    )
    assert right.status_code == 403
    assert right.json()["error"]["code"] == "account_suspended"
    assert "CONFIDENTIAL" not in right.text
    assert "revforge_session" not in right.cookies

    async def get_failed_audits(session: AsyncSession) -> list[AuditEvent]:
        res = await session.execute(
            select(AuditEvent)
            .where(AuditEvent.event_type == "auth.login.failed")
            .order_by(AuditEvent.created_at.asc())
        )
        return list(res.scalars())

    audits = _run_async(session_factory, get_failed_audits)
    reasons = [a.metadata_json.get("reason") for a in audits]
    assert "invalid_credentials" in reasons
    assert "account_suspended" in reasons


def test_i3_corrupt_password_hash_returns_401_not_500(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    register_and_login(
        client, email="corrupt@example.com", display_name="Corrupt", password=PASSWORD
    )
    client.cookies.clear()

    async def corrupt_hash(session: AsyncSession) -> None:
        cred = await session.scalar(
            select(UserPasswordCredential)
            .join(User, User.id == UserPasswordCredential.user_id)
            .where(User.email == "corrupt@example.com")
        )
        assert cred is not None
        cred.password_hash = "not-a-valid-argon2-hash"
        await session.commit()

    _run_async(session_factory, corrupt_hash)

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "corrupt@example.com", "password": PASSWORD},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"


# ---------------------------------------------------------------------------
# I23: Progressive lockout, per-IP limit, trusted proxy IP, committed audit
# ---------------------------------------------------------------------------


def test_i23_per_account_lockout_and_audit_parity_for_existing_and_unknown_emails(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    register_and_login(
        client, email="victim@example.com", display_name="Victim", password=PASSWORD
    )
    client.cookies.clear()

    for email in ("victim@example.com", "ghost@example.com"):
        for attempt in range(4):
            r = client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": f"WrongPass{attempt}123"},
            )
            assert r.status_code == 401, (email, attempt, r.text)

        fifth = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassFinal123"},
        )
        assert fifth.status_code == 429, fifth.text
        assert fifth.json()["error"]["code"] == "login_locked"
        assert int(fifth.headers["Retry-After"]) >= 1

        # Subsequent attempt while locked also returns 429 with Retry-After
        sixth = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert sixth.status_code == 429
        assert int(sixth.headers["Retry-After"]) >= 1

    async def get_audits(session: AsyncSession) -> list[AuditEvent]:
        res = await session.execute(select(AuditEvent))
        return list(res.scalars())

    audits = _run_async(session_factory, get_audits)
    failed = [a for a in audits if a.event_type == "auth.login.failed"]
    locked = [a for a in audits if a.event_type == "auth.login.locked"]
    assert len(failed) >= 10
    assert len(locked) >= 2
    assert all(a.severity == "high" for a in locked)
    # Never log passwords in audit metadata
    for a in audits:
        serialized = str(a.metadata_json)
        assert "WrongPass" not in serialized
        assert PASSWORD not in serialized


def test_i23_per_ip_login_limit_across_distinct_emails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_AUTH_LOGIN_IP_MAX_FAILURES", "3")
    get_settings.cache_clear()

    for idx in range(2):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": f"u{idx}@example.com", "password": "WrongPassword123"},
        )
        assert r.status_code == 401

    third = client.post(
        "/api/v1/auth/login",
        json={"email": "u2@example.com", "password": "WrongPassword123"},
    )
    assert third.status_code == 429
    assert third.json()["error"]["code"] == "rate_limited"
    assert int(third.headers["Retry-After"]) >= 1


def test_i23_successful_login_clears_account_failures(client: TestClient) -> None:
    register_and_login(client, email="ok@example.com", display_name="OK", password=PASSWORD)
    client.cookies.clear()

    for _ in range(3):
        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "ok@example.com", "password": "BadPassword123"},
            ).status_code
            == 401
        )

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "ok@example.com", "password": PASSWORD},
        ).status_code
        == 200
    )
    client.cookies.clear()

    # Counter was cleared, so 3 more failures still return 401 (not 429)
    for _ in range(3):
        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "ok@example.com", "password": "BadPassword123"},
            ).status_code
            == 401
        )


def test_i23_trusted_proxy_client_ip_resolution(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def make_req(peer: str, xff: str | None = None):
        headers = {"x-forwarded-for": xff} if xff is not None else {}
        return SimpleNamespace(client=SimpleNamespace(host=peer), headers=headers)

    # Untrusted peer: ignore spoofed XFF completely
    monkeypatch.setenv("REVFORGE_TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
    get_settings.cache_clear()
    settings = get_settings()
    assert resolve_client_ip(make_req("198.51.100.7", "1.2.3.4"), settings) == "198.51.100.7"

    # Trusted peer: walk right-to-left, skip trusted proxies, pick rightmost untrusted IP
    assert (
        resolve_client_ip(
            make_req("10.0.0.5", "9.9.9.9, 203.0.113.42, 10.0.0.2"),
            settings,
        )
        == "203.0.113.42"
    )
    # IPv4-mapped IPv6 peer normalized
    assert (
        resolve_client_ip(make_req("::ffff:10.0.0.5", "203.0.113.99"), settings)
        == "203.0.113.99"
    )


# ---------------------------------------------------------------------------
# I24: Idle session timeout & throttled last_seen_at persistence
# ---------------------------------------------------------------------------


def test_i24_idle_session_timeout_revokes_and_returns_machine_readable_401(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    register_and_login(client, email="idle@example.com", display_name="Idle", password=PASSWORD)
    assert client.get("/api/v1/auth/me").status_code == 200

    # Backdate last_seen_at past default 30-minute idle window while keeping expires_at in future
    async def age_session(session: AsyncSession) -> None:
        user_session = await session.scalar(select(UserSession))
        assert user_session is not None
        user_session.last_seen_at = utc_now() - timedelta(minutes=35)
        user_session.expires_at = utc_now() + timedelta(hours=12)
        await session.commit()

    _run_async(session_factory, age_session)

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401
    err = me.json()["error"]
    assert err["code"] == "session_idle_timeout"
    assert err["reason"] == "idle_timeout"

    # Session must have been revoked in DB
    async def check_revoked(session: AsyncSession) -> bool:
        user_session = await session.scalar(select(UserSession))
        assert user_session is not None
        return user_session.revoked_at is not None

    assert _run_async(session_factory, check_revoked) is True

    # Subsequent authed endpoint also rejects
    assert client.get("/api/v1/organizations").status_code == 401


def test_i24_throttled_last_seen_at_persists_on_read_only_get(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    register_and_login(
        client, email="active@example.com", display_name="Active", password=PASSWORD
    )

    past = utc_now() - timedelta(minutes=5)

    async def set_past(session: AsyncSession) -> None:
        user_session = await session.scalar(select(UserSession))
        assert user_session is not None
        user_session.last_seen_at = past
        await session.commit()

    _run_async(session_factory, set_past)

    # Read-only GET should persist updated last_seen_at because 5m >= 60s touch interval
    assert client.get("/api/v1/auth/me").status_code == 200

    async def get_seen(session: AsyncSession):
        user_session = await session.scalar(select(UserSession))
        assert user_session is not None
        return user_session.last_seen_at

    refreshed = _run_async(session_factory, get_seen)
    assert refreshed is not None
    assert ensure_utc(refreshed) > ensure_utc(past)


# ---------------------------------------------------------------------------
# I25: Registration 202, verify-email, password-reset, handle check
# ---------------------------------------------------------------------------


def test_i25_registration_is_neutral_202_and_avoids_reserved_auto_handles(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    # admin@example.com must NOT get reserved handle "admin"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@example.com",
            "display_name": "Admin Candidate",
            "password": PASSWORD,
        },
    )
    assert reg.status_code == 202
    assert reg.json()["status"] == "accepted"
    assert "revforge_session" not in reg.cookies
    assert "token" not in reg.text.lower()

    # Duplicate email on an ALREADY-VERIFIED account returns identical 202 and runs dummy verify
    ver_msg = in_memory_email_sender.latest_for("admin@example.com", kind="email_verification")
    assert ver_msg is not None and ver_msg.token is not None
    # Verify via a separate user first so we still test unverified protections on admin@example.com
    register_and_login(
        client, email="verified-dup@example.com", display_name="Verified", password=PASSWORD
    )
    client.cookies.clear()

    calls: list[str] = []
    real_verify = auth_service.verify_password

    def spy_verify(h: str, p: str) -> bool:
        calls.append(h)
        return real_verify(h, p)

    with patch.object(auth_service, "verify_password", side_effect=spy_verify):
        dup = client.post(
            "/api/v1/auth/register",
            json={
                "email": "verified-dup@example.com",
                "display_name": "Other",
                "password": PASSWORD,
            },
        )
    assert dup.status_code == 202
    assert dup.json() == reg.json()
    assert len(calls) == 1

    async def fetch_user(session: AsyncSession) -> User:
        user = await session.scalar(select(User).where(User.email == "admin@example.com"))
        assert user is not None
        return user

    user = _run_async(session_factory, fetch_user)
    assert user.handle != "admin"
    assert user.email_verified_at is None

    # Unverified user cannot log in (403 email_not_verified only after right password)
    wrong_pw = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "WrongPassword123"},
    )
    assert wrong_pw.status_code == 401

    right_pw = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": PASSWORD},
    )
    assert right_pw.status_code == 403
    assert right_pw.json()["error"]["code"] == "email_not_verified"

    # Unverified user is hidden from public profile
    assert client.get(f"/api/v1/users/{user.handle}").status_code == 404


def test_i25_verify_email_single_use_hashed_at_rest_and_resend(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "verify@example.com",
            "display_name": "Verify Me",
            "password": PASSWORD,
            "handle": "verify-me",
        },
    )
    assert reg.status_code == 202

    msg = in_memory_email_sender.latest_for("verify@example.com", kind="email_verification")
    assert msg is not None and msg.token is not None
    raw_token = msg.token

    # Token must NOT be stored in plaintext in DB
    async def check_hashed(session: AsyncSession) -> EmailVerificationToken:
        rec = await session.scalar(select(EmailVerificationToken))
        assert rec is not None
        return rec

    rec = _run_async(session_factory, check_hashed)
    assert rec.token_hash != raw_token
    assert len(rec.token_hash) == 64

    # Resend returns 202 neutral and invalidates previous token
    resend = client.post(
        "/api/v1/auth/verify-email/resend",
        json={"email": "verify@example.com"},
    )
    assert resend.status_code == 202
    assert resend.json()["status"] == "accepted"

    # Old token is now invalid
    old_try = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert old_try.status_code == 400
    assert old_try.json()["error"]["code"] == "invalid_or_expired_token"

    # New token succeeds once, sets no cookies (no auto-login), replay fails
    new_msg = in_memory_email_sender.latest_for("verify@example.com", kind="email_verification")
    assert new_msg is not None and new_msg.token is not None and new_msg.token != raw_token

    ok = client.post("/api/v1/auth/verify-email", json={"token": new_msg.token})
    assert ok.status_code == 200
    assert ok.json() == {"verified": True}
    assert "revforge_session" not in ok.cookies

    replay = client.post("/api/v1/auth/verify-email", json={"token": new_msg.token})
    assert replay.status_code == 400
    assert replay.json()["error"]["code"] == "invalid_or_expired_token"

    # Now login works and public profile is visible
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "verify@example.com", "password": PASSWORD},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/users/verify-me").status_code == 200


def test_i25_password_reset_revokes_sessions_and_break_glass_and_clears_lockout(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    register_and_login(
        client, email="reset@example.com", display_name="Reset Admin", password=PASSWORD
    )
    # Create org + repo via API and seed an active break-glass session for this user
    assert (
        client.post(
            "/api/v1/organizations",
            json={"slug": "bg-org", "display_name": "BG Org", "description": None},
            headers=_csrf(client),
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/organizations/bg-org/repositories",
            json={
                "slug": "bg-repo",
                "display_name": "BG Repo",
                "description": None,
                "visibility": "private",
            },
            headers=_csrf(client),
        ).status_code
        == 201
    )

    async def seed_break_glass(session: AsyncSession) -> None:
        user = await session.scalar(select(User).where(User.email == "reset@example.com"))
        org = await session.scalar(select(Organization).where(Organization.slug == "bg-org"))
        repo = await session.scalar(select(Repository).where(Repository.slug == "bg-repo"))
        assert user is not None and org is not None and repo is not None
        user.is_platform_admin = True
        session.add(
            BreakGlassSession(
                actor_user_id=user.id,
                organization_id=org.id,
                repository_id=repo.id,
                reason="Incident review",
                duration_minutes=60,
                expires_at=utc_now() + timedelta(minutes=60),
            )
        )
        await session.commit()

    _run_async(session_factory, seed_break_glass)

    old_session_cookie = client.cookies.get("revforge_session")
    assert old_session_cookie is not None

    # Request reset for both existing and unknown emails -> identical 202
    req_real = client.post("/api/v1/auth/password-reset", json={"email": "reset@example.com"})
    req_fake = client.post("/api/v1/auth/password-reset", json={"email": "nobody@example.com"})
    assert req_real.status_code == 202
    assert req_fake.status_code == 202
    assert req_real.json() == req_fake.json()

    reset_msg = in_memory_email_sender.latest_for("reset@example.com", kind="password_reset")
    assert reset_msg is not None and reset_msg.token is not None

    # Confirm reset with new password
    new_password = "BrandNewPassword456"
    confirm = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": reset_msg.token, "new_password": new_password},
    )
    assert confirm.status_code == 200
    assert confirm.json() == {"reset": True}

    # Replay fails
    assert (
        client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": reset_msg.token, "new_password": "AnotherPassword789"},
        ).status_code
        == 400
    )

    # Old session cookie is revoked
    client.cookies.set("revforge_session", old_session_cookie)
    assert client.get("/api/v1/auth/me").status_code == 401
    client.cookies.clear()

    # Break-glass session is revoked & high-severity audit logged
    async def check_post_reset(session: AsyncSession) -> tuple[bool, bool, bool]:
        bg = await session.scalar(select(BreakGlassSession))
        tok = await session.scalar(select(PasswordResetToken))
        audit = await session.scalar(
            select(AuditEvent).where(AuditEvent.event_type == "auth.password_reset.completed")
        )
        assert bg is not None and tok is not None and audit is not None
        return (
            bg.revoked_at is not None,
            tok.used_at is not None and tok.token_hash != reset_msg.token,
            audit.severity == "high"
            and audit.metadata_json.get("sessions_revoked", 0) >= 1
            and audit.metadata_json.get("break_glass_revoked", 0) == 1,
        )

    bg_revoked, tok_used, audit_ok = _run_async(session_factory, check_post_reset)
    assert bg_revoked is True
    assert tok_used is True
    assert audit_ok is True

    # Old password rejected, new password works
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "reset@example.com", "password": PASSWORD},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "reset@example.com", "password": new_password},
        ).status_code
        == 200
    )


def test_i25_check_handle_validation_reserved_taken_and_rate_limit(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    register_and_login(
        client,
        email="taken@example.com",
        display_name="Taken",
        password=PASSWORD,
        handle="taken-handle",
    )
    client.cookies.clear()

    # Invalid syntax
    inv = client.get("/api/v1/users/check-handle", params={"h": "a"})
    assert inv.status_code == 200
    assert inv.json() == {"available": False, "reason": "invalid"}

    # Reserved slugs (including admin, check-handle, welcome)
    for reserved in ("admin", "check-handle", "welcome", "docs"):
        r = client.get("/api/v1/users/check-handle", params={"h": reserved})
        assert r.status_code == 200
        assert r.json() == {"available": False, "reason": "reserved"}, reserved

    # Taken handle
    taken = client.get("/api/v1/users/check-handle", params={"h": "taken-handle"})
    assert taken.status_code == 200
    assert taken.json() == {"available": False, "reason": "taken"}

    # Available handle
    ok = client.get("/api/v1/users/check-handle", params={"h": "fresh-handle"})
    assert ok.status_code == 200
    assert ok.json() == {"available": True, "reason": None}

    # Rate limit enforcement
    monkeypatch.setenv("REVFORGE_AUTH_CHECK_HANDLE_IP_MAX_REQUESTS", "2")
    get_settings.cache_clear()
    from app.services.auth_rate_limit import auth_rate_limiter

    auth_rate_limiter.reset()
    assert client.get("/api/v1/users/check-handle", params={"h": "one-ok"}).status_code == 200
    assert client.get("/api/v1/users/check-handle", params={"h": "two-ok"}).status_code == 200
    limited = client.get("/api/v1/users/check-handle", params={"h": "three-ok"})
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) >= 1


def test_h1_pre_account_takeover_prevented_and_unverified_cannot_join_org(
    client: TestClient,
) -> None:
    # 1. Attacker pre-registers victim's email with attacker's password
    attacker_reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "victim-pre@example.com",
            "display_name": "Attacker Fake",
            "password": "AttackerPassword123",
        },
    )
    assert attacker_reg.status_code == 202
    attacker_msg = in_memory_email_sender.latest_for(
        "victim-pre@example.com", kind="email_verification"
    )
    assert attacker_msg is not None and attacker_msg.token is not None

    # 2. Org owner cannot pre-add the unverified account to an org
    register_and_login(
        client, email="org-owner-h1@example.com", display_name="Org Owner", password=PASSWORD
    )
    assert (
        client.post(
            "/api/v1/organizations",
            json={"slug": "h1-org", "display_name": "H1 Org", "description": None},
            headers=_csrf(client),
        ).status_code
        == 201
    )
    add_unverified = client.post(
        "/api/v1/organizations/h1-org/members",
        json={"user": "victim-pre@example.com", "role": "member"},
        headers=_csrf(client),
    )
    assert add_unverified.status_code == 404
    client.cookies.clear()

    # 3. Victim registers with their own password -> overwrites pending password & invalidates old
    victim_password = "VictimRealPassword789"
    victim_reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "victim-pre@example.com",
            "display_name": "Real Victim",
            "password": victim_password,
        },
    )
    assert victim_reg.status_code == 202

    # Attacker's old verification link is invalidated
    assert (
        client.post("/api/v1/auth/verify-email", json={"token": attacker_msg.token}).status_code
        == 400
    )

    # Victim's fresh verification link activates victim's password (attacker's password fails)
    victim_msg = in_memory_email_sender.latest_for(
        "victim-pre@example.com", kind="email_verification"
    )
    assert victim_msg is not None and victim_msg.token is not None
    assert victim_msg.token != attacker_msg.token
    assert (
        client.post("/api/v1/auth/verify-email", json={"token": victim_msg.token}).status_code
        == 200
    )

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "victim-pre@example.com", "password": "AttackerPassword123"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "victim-pre@example.com", "password": victim_password},
        ).status_code
        == 200
    )


def test_h4_multi_header_x_forwarded_for_uses_rightmost_header(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    from starlette.datastructures import Headers

    monkeypatch.setenv("REVFORGE_TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
    get_settings.cache_clear()
    settings = get_settings()

    # Attacker prepends a forged X-Forwarded-For header; trusted proxy appends a second header.
    headers = Headers(
        raw=[
            (b"x-forwarded-for", b"1.1.1.1"),
            (b"x-forwarded-for", b"203.0.113.77, 10.0.0.9"),
        ]
    )
    req = SimpleNamespace(client=SimpleNamespace(host="10.0.0.5"), headers=headers)
    assert resolve_client_ip(req, settings) == "203.0.113.77"


def test_m2_already_locked_retries_do_not_flood_audit_log(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    for i in range(5):
        client.post(
            "/api/v1/auth/login",
            json={"email": "flood@example.com", "password": f"WrongPass{i}123"},
        )

    # 5 more retries while already locked must all return 429 without adding more locked rows
    for _ in range(5):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "flood@example.com", "password": "WrongPassAgain123"},
        )
        assert r.status_code == 429

    async def count_locked(session: AsyncSession) -> int:
        res = await session.execute(
            select(AuditEvent).where(AuditEvent.event_type == "auth.login.locked")
        )
        return len(list(res.scalars()))

    assert _run_async(session_factory, count_locked) == 1

