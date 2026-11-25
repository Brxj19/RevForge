"""Phase 6 security & functional tests: Forge Admin, Break-Glass, Suspension, Health, Audit."""

from __future__ import annotations

import asyncio
import base64
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.security import utc_now
from app.domain.enums import (
    RepositoryProvisioningState,
    RepositoryRole,
)
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.http_gateway import HgHttpGatewayApplication
from app.mercurial.ssh_gateway import MercurialSshGateway
from app.mercurial.ssh_gateway import main as ssh_gateway_main
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.audit_event import AuditEvent
from app.models.break_glass_session import BreakGlassSession
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.user import User
from app.services.admin_service import (
    get_active_break_glass_for_actor,
    get_admin_health,
    get_admin_overview,
    list_admin_organizations,
    list_admin_repositories,
    list_admin_users,
    list_break_glass_sessions,
    reactivate_user,
    reset_repository_provisioning,
    retry_repository_provisioning,
    revoke_break_glass,
    revoke_user_sessions_admin,
    start_break_glass,
    suspend_user,
)
from app.services.authorization import repository_access_for_actor
from app.services.errors import AuthenticationError, ForbiddenError
from app.services.transport_credentials import (
    authenticate_personal_access_token,
    create_personal_access_token,
    create_ssh_public_key,
)

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}
SSH_KEY_A = (
    "ssh-ed25519 "
    + base64.b64encode(b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00 " + b"A" * 32).decode("ascii")
    + " alice@revforge"
)


def _register(
    client: TestClient,
    *,
    email: str,
    display_name: str = "Test User",
    password: str = "StrongPassword123",
    extra: dict[str, object] | None = None,
):
    from tests.auth_helpers import register_and_login

    return register_and_login(
        client,
        email=email,
        display_name=display_name,
        password=password,
        extra=extra,
    )


def _login(client: TestClient, *, email: str, password: str = "StrongPassword123"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _csrf(client: TestClient) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN_HEADERS}


def _promote_platform_admin(session_factory: async_sessionmaker[AsyncSession], email: str) -> str:
    async def runner() -> str:
        async with session_factory() as session:
            user = await session.scalar(select(User).where(User.email == email))
            assert user is not None
            user.is_platform_admin = True
            await session.commit()
            return str(user.id)

    return asyncio.run(runner())


def _get_user(session_factory: async_sessionmaker[AsyncSession], email: str) -> User:
    async def runner() -> User:
        async with session_factory() as session:
            user = await session.scalar(select(User).where(User.email == email))
            assert user is not None
            return user

    return asyncio.run(runner())


def _create_org_and_private_repos(
    client: TestClient,
    *,
    owner_email: str = "org-owner@example.com",
    org_slug: str = "acme",
    repo_slugs: tuple[str, ...] = ("secret-a", "secret-b"),
) -> dict[str, str]:
    reg = _register(client, email=owner_email, display_name="Org Owner")
    assert reg.status_code == 200
    org_resp = client.post(
        "/api/v1/organizations",
        json={"slug": org_slug, "display_name": org_slug.title(), "description": None},
        headers=_csrf(client),
    )
    assert org_resp.status_code == 201
    repo_ids: dict[str, str] = {}
    for slug in repo_slugs:
        repo_resp = client.post(
            f"/api/v1/organizations/{org_slug}/repositories",
            json={
                "slug": slug,
                "display_name": slug.title(),
                "description": "Private repo",
                "visibility": "private",
            },
            headers=_csrf(client),
        )
        assert repo_resp.status_code == 201
        repo_ids[slug] = repo_resp.json()["id"]
    return repo_ids


# ---------------------------------------------------------------------------
# 1. Authentication, Authorization, Mass Assignment & CSRF Matrix
# ---------------------------------------------------------------------------


def test_admin_endpoints_reject_unauthenticated_regular_org_owner_and_suspended_admin(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    admin_get_paths = [
        "/api/v1/admin/overview",
        "/api/v1/admin/health",
        "/api/v1/admin/users",
        "/api/v1/admin/organizations",
        "/api/v1/admin/repositories",
        "/api/v1/admin/break-glass",
        "/api/v1/me/break-glass",
    ]

    # 401 unauthenticated
    for path in admin_get_paths:
        assert client.get(path).status_code == 401, path

    # 403 regular user
    assert _register(client, email="regular@example.com", display_name="Regular").status_code == 200
    for path in admin_get_paths:
        assert client.get(path).status_code == 403, path

    # 403 org owner/admin (still NOT platform_admin)
    assert (
        client.post(
            "/api/v1/organizations",
            json={"slug": "owners-org", "display_name": "Owners Org", "description": None},
            headers=_csrf(client),
        ).status_code
        == 201
    )
    for path in admin_get_paths:
        assert client.get(path).status_code == 403, path

    # Suspended platform admin -> 401
    assert _register(client, email="padmin@example.com", display_name="Admin").status_code == 200
    _promote_platform_admin(session_factory, "padmin@example.com")
    assert client.get("/api/v1/admin/overview").status_code == 200

    async def suspend_direct() -> None:
        async with session_factory() as session:
            u = await session.scalar(select(User).where(User.email == "padmin@example.com"))
            assert u is not None
            u.is_active = False
            await session.commit()

    asyncio.run(suspend_direct())
    for path in admin_get_paths:
        assert client.get(path).status_code == 401, path


def test_mass_assignment_cannot_set_is_platform_admin(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    resp = _register(
        client,
        email="attacker@example.com",
        display_name="Attacker",
        extra={"is_platform_admin": True},
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["is_platform_admin"] is False

    patch_resp = client.patch(
        "/api/v1/me/profile",
        json={"display_name": "Attacker2", "is_platform_admin": True},
        headers=_csrf(client),
    )
    assert patch_resp.status_code == 200

    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["is_platform_admin"] is False

    user = _get_user(session_factory, "attacker@example.com")
    assert user.is_platform_admin is False


def test_csrf_required_on_all_admin_mutations(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    assert _register(client, email="admin@example.com", display_name="Admin").status_code == 200
    _promote_platform_admin(session_factory, "admin@example.com")
    fake_id = str(uuid4())

    # Missing CSRF header -> 403 on all mutations
    mutations = [
        ("POST", f"/api/v1/admin/users/{fake_id}/suspend", {"reason": "Policy violation"}),
        ("POST", f"/api/v1/admin/users/{fake_id}/reactivate", None),
        ("POST", f"/api/v1/admin/users/{fake_id}/revoke-sessions", None),
        ("POST", f"/api/v1/admin/repositories/{fake_id}/reset-provisioning", None),
        ("POST", f"/api/v1/admin/repositories/{fake_id}/retry-provisioning", None),
        (
            "POST",
            "/api/v1/admin/break-glass",
            {
                "org_slug": "acme",
                "repo_slug": "core",
                "reason": "Incident response investigation",
                "minutes": 15,
            },
        ),
        ("DELETE", f"/api/v1/admin/break-glass/{fake_id}", None),
    ]
    for method, path, body in mutations:
        resp = client.request(method, path, json=body, headers=ORIGIN_HEADERS)
        assert resp.status_code == 403, f"{method} {path}"
        # Wrong CSRF header -> also 403
        bad_headers = {"X-CSRF-Token": "wrong-token", **ORIGIN_HEADERS}
        resp2 = client.request(method, path, json=body, headers=bad_headers)
        assert resp2.status_code == 403, f"bad csrf {method} {path}"


@pytest.mark.asyncio
async def test_service_layer_direct_platform_admin_enforcement(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    settings = get_settings()
    storage_locator = RepositoryStorageLocator(settings)
    command_runner = HgCommandRunner(settings)

    async with session_factory() as session:
        regular = User(email="reg@example.com", display_name="Reg", is_active=True)
        suspended_admin = User(
            email="susp-admin@example.com",
            display_name="Susp Admin",
            is_active=False,
            is_platform_admin=True,
        )
        session.add_all([regular, suspended_admin])
        await session.commit()

        for actor in (None, regular, suspended_admin):
            with pytest.raises(ForbiddenError):
                await get_admin_overview(session, actor=actor, settings=settings)
            with pytest.raises(ForbiddenError):
                await get_admin_health(session, actor=actor, settings=settings)
            with pytest.raises(ForbiddenError):
                await list_admin_users(session, actor=actor)
            with pytest.raises(ForbiddenError):
                await suspend_user(
                    session,
                    actor=actor,
                    target_user_id=regular.id,
                    reason="valid reason",
                    request_id=None,
                    settings=settings,
                )
            with pytest.raises(ForbiddenError):
                await reactivate_user(
                    session,
                    actor=actor,
                    target_user_id=regular.id,
                    request_id=None,
                    settings=settings,
                )
            with pytest.raises(ForbiddenError):
                await revoke_user_sessions_admin(
                    session,
                    actor=actor,
                    target_user_id=regular.id,
                    request_id=None,
                )
            with pytest.raises(ForbiddenError):
                await list_admin_organizations(session, actor=actor)
            with pytest.raises(ForbiddenError):
                await list_admin_repositories(session, actor=actor, settings=settings)
            with pytest.raises(ForbiddenError):
                await reset_repository_provisioning(
                    session,
                    actor=actor,
                    repository_id=uuid4(),
                    request_id=None,
                    settings=settings,
                )
            with pytest.raises(ForbiddenError):
                await retry_repository_provisioning(
                    session,
                    actor=actor,
                    repository_id=uuid4(),
                    request_id=None,
                    settings=settings,
                    storage_locator=storage_locator,
                    command_runner=command_runner,
                )
            with pytest.raises(ForbiddenError):
                await start_break_glass(
                    session,
                    actor=actor,
                    org_slug="acme",
                    repo_slug="core",
                    reason="Incident investigation 123",
                    minutes=15,
                    request_id=None,
                )
            with pytest.raises(ForbiddenError):
                await list_break_glass_sessions(session, actor=actor)
            with pytest.raises(ForbiddenError):
                await revoke_break_glass(session, actor=actor, session_id=uuid4(), request_id=None)
            with pytest.raises(ForbiddenError):
                await get_active_break_glass_for_actor(session, actor=actor)


# ---------------------------------------------------------------------------
# 2. Break-Glass Security Matrix
# ---------------------------------------------------------------------------


def test_break_glass_full_lifecycle_isolation_audit_notifications_and_exclusions(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    _create_org_and_private_repos(
        client,
        owner_email="owner@example.com",
        org_slug="acme",
        repo_slugs=("secret-a", "secret-b"),
    )

    # Create platform admin (NOT a member of acme)
    assert _register(client, email="padmin@example.com", display_name="P Admin").status_code == 200
    _promote_platform_admin(session_factory, "padmin@example.com")

    # No implicit private repo access without break-glass -> 404
    assert client.get("/api/v1/organizations/acme/repositories/secret-a").status_code == 404
    assert client.get("/api/v1/me/break-glass").json() is None

    # Validation failures -> 422
    assert (
        client.post(
            "/api/v1/admin/break-glass",
            json={
                "org_slug": "acme",
                "repo_slug": "secret-a",
                "reason": "Incident response investigation",
                "minutes": 30,  # invalid duration
            },
            headers=_csrf(client),
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/admin/break-glass",
            json={
                "org_slug": "acme",
                "repo_slug": "secret-a",
                "reason": "too short",  # < 10 chars
                "minutes": 15,
            },
            headers=_csrf(client),
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/admin/break-glass",
            json={
                "org_slug": "acme",
                "repo_slug": "secret-a",
                "reason": "Incident\nwith newline control char",
                "minutes": 15,
            },
            headers=_csrf(client),
        ).status_code
        == 422
    )

    # Start valid break-glass session on secret-a
    start_resp = client.post(
        "/api/v1/admin/break-glass",
        json={
            "org_slug": "acme",
            "repo_slug": "secret-a",
            "reason": "INC-2041 production outage investigation",
            "minutes": 15,
        },
        headers=_csrf(client),
    )
    assert start_resp.status_code == 201
    bg_data = start_resp.json()
    bg_id = bg_data["id"]
    assert bg_data["org"] == "acme"
    assert bg_data["repo"] == "secret-a"
    assert bg_data["active"] is True

    # GET /me/break-glass returns active session
    me_bg = client.get("/api/v1/me/break-glass")
    assert me_bg.status_code == 200
    assert me_bg.json()["id"] == bg_id

    # Concurrent active session rejected -> 409
    dup_resp = client.post(
        "/api/v1/admin/break-glass",
        json={
            "org_slug": "acme",
            "repo_slug": "secret-b",
            "reason": "Second concurrent break-glass attempt",
            "minutes": 15,
        },
        headers=_csrf(client),
    )
    assert dup_resp.status_code == 409

    # Read-only access granted on secret-a
    repo_a_resp = client.get("/api/v1/organizations/acme/repositories/secret-a")
    assert repo_a_resp.status_code == 200
    assert repo_a_resp.json()["viewer_role"] == "read"
    assert repo_a_resp.json()["can_manage"] is False

    # Single-repo isolation: secret-b still 404!
    assert client.get("/api/v1/organizations/acme/repositories/secret-b").status_code == 404

    # Write / settings / PR create blocked -> 403
    assert (
        client.patch(
            "/api/v1/organizations/acme/repositories/secret-a",
            json={"description": "Tampered"},
            headers=_csrf(client),
        ).status_code
        == 403
    )
    assert (
        client.delete(
            "/api/v1/organizations/acme/repositories/secret-a",
            headers=_csrf(client),
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/organizations/acme/repositories/secret-a/pull-requests",
            json={
                "title": "Unauthorized PR",
                "description": None,
                "source_revision": "0" * 40,
                "target_revision": "0" * 40,
                "source_branch": "feat",
                "target_branch": "default",
            },
            headers=_csrf(client),
        ).status_code
        == 403
    )

    # Search excluded: private repo secret-a must NOT appear in search
    search_resp = client.get("/api/v1/search/repositories", params={"q": "secret"})
    assert search_resp.status_code == 200
    assert search_resp.json()["items"] == []

    # Transport excluded (HTTP & SSH gateways deny private repo even with active break-glass)
    async def check_transport_denied() -> None:
        settings = get_settings()
        async with session_factory() as session:
            padmin = await session.scalar(select(User).where(User.email == "padmin@example.com"))
            assert padmin is not None
            issued = await create_personal_access_token(
                session,
                settings=settings,
                user=padmin,
                name="admin-pat",
                capability=RepositoryRole.READ,
                expires_at=None,
                organization_id=None,
                repository_id=None,
                request_id=None,
            )
            ssh_key = await create_ssh_public_key(
                session,
                user=padmin,
                public_key=SSH_KEY_A,
                label="admin-ssh",
                request_id=None,
            )
            # Mark repo ready so transport checks authorization, not provisioning
            repo_a = await session.scalar(select(Repository).where(Repository.slug == "secret-a"))
            assert repo_a is not None
            repo_a.provisioning_state = RepositoryProvisioningState.READY
            await session.commit()

        # HTTP gateway check
        http_gw = HgHttpGatewayApplication(
            settings=settings, session_factory_getter=lambda: session_factory
        )
        from app.mercurial.http_gateway import TransportCommandKind
        from app.services.errors import NotFoundError

        with pytest.raises(NotFoundError):
            await http_gw._authorize(
                organization_slug="acme",
                repository_slug="secret-a",
                command_kind=TransportCommandKind.READ,
                basic_auth=("padmin@example.com", issued.raw_token),
                request_id="req-http-bg",
                remote_addr="127.0.0.1",
            )

        # SSH gateway check
        ssh_gw = MercurialSshGateway(
            settings=settings,
            session_factory_getter=lambda: session_factory,
            key_id=ssh_key.id,
        )
        with patch.dict(
            "os.environ", {"SSH_ORIGINAL_COMMAND": "hg -R acme/secret-a serve --stdio"}
        ):
            with pytest.raises(NotFoundError):
                await ssh_gw.run()

    asyncio.run(check_transport_denied())

    # Verify committed admin.break_glass.used audit event in a FRESH session
    async def verify_used_audit() -> None:
        async with session_factory() as fresh_session:
            events = list(
                await fresh_session.scalars(
                    select(AuditEvent).where(AuditEvent.event_type == "admin.break_glass.used")
                )
            )
            assert len(events) >= 1
            assert events[0].severity == "high"
            assert events[0].metadata_json.get("break_glass_session_id") == bg_id

    asyncio.run(verify_used_audit())

    # Org owner receives in-app notification & sees break-glass events in org audit log
    assert _login(client, email="owner@example.com").status_code == 200
    notif_resp = client.get("/api/v1/me/notifications")
    assert notif_resp.status_code == 200
    assert any(n["type"] == "break_glass_started" for n in notif_resp.json()["items"])

    async def get_org_id() -> str:
        async with session_factory() as s:
            o = await s.scalar(select(Organization).where(Organization.slug == "acme"))
            assert o is not None
            return str(o.id)

    org_id = asyncio.run(get_org_id())
    org_audit = client.get("/api/v1/audit", params={"organization_id": org_id})
    assert org_audit.status_code == 200
    org_event_types = {e["event_type"] for e in org_audit.json()["events"]}
    assert "admin.break_glass.started" in org_event_types
    assert "admin.break_glass.used" in org_event_types

    # Revoke break-glass immediately terminates access
    assert _login(client, email="padmin@example.com").status_code == 200
    del_resp = client.delete(f"/api/v1/admin/break-glass/{bg_id}", headers=_csrf(client))
    assert del_resp.status_code == 200
    assert del_resp.json()["active"] is False
    assert del_resp.json()["revoked_at"] is not None
    assert client.get("/api/v1/organizations/acme/repositories/secret-a").status_code == 404
    assert client.get("/api/v1/me/break-glass").json() is None

    # Server-side expiration denies access
    start2 = client.post(
        "/api/v1/admin/break-glass",
        json={
            "org_slug": "acme",
            "repo_slug": "secret-a",
            "reason": "INC-2042 follow-up investigation",
            "minutes": 15,
        },
        headers=_csrf(client),
    )
    assert start2.status_code == 201
    bg2_id = start2.json()["id"]

    async def expire_bg() -> None:
        from uuid import UUID

        async with session_factory() as session:
            bg = await session.get(BreakGlassSession, UUID(bg2_id))
            assert bg is not None
            bg.expires_at = utc_now() - timedelta(minutes=1)
            await session.commit()

    asyncio.run(expire_bg())
    assert client.get("/api/v1/organizations/acme/repositories/secret-a").status_code == 404
    assert client.get("/api/v1/me/break-glass").json() is None


# ---------------------------------------------------------------------------
# 3. User Suspension, Last-Admin Protection, Atomic Revocation & I10 SSH Exit
# ---------------------------------------------------------------------------


def test_user_suspension_last_admin_revocation_ssh_and_reactivation(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    _create_org_and_private_repos(
        client, owner_email="victim@example.com", org_slug="v-org", repo_slugs=("v-repo",)
    )
    victim_cookies = dict(client.cookies)
    victim_user = _get_user(session_factory, "victim@example.com")

    # Give victim a PAT and an SSH key
    async def setup_victim_creds() -> tuple[str, str]:
        settings = get_settings()
        async with session_factory() as session:
            u = await session.get(User, victim_user.id)
            assert u is not None
            issued = await create_personal_access_token(
                session,
                settings=settings,
                user=u,
                name="victim-pat",
                capability=RepositoryRole.READ,
                expires_at=None,
                organization_id=None,
                repository_id=None,
                request_id=None,
            )
            key = await create_ssh_public_key(
                session,
                user=u,
                public_key=SSH_KEY_A,
                label="victim-ssh",
                request_id=None,
                authorized_keys_output_path=Path(settings.ssh_authorized_keys_path),
            )
            return issued.raw_token, str(key.id)

    raw_pat, key_id = asyncio.run(setup_victim_creds())
    auth_keys_file = Path(get_settings().ssh_authorized_keys_path)
    assert key_id in auth_keys_file.read_text(encoding="utf-8")

    # Register two platform admins
    assert _register(client, email="admin1@example.com", display_name="Admin 1").status_code == 200
    admin1_id = _promote_platform_admin(session_factory, "admin1@example.com")

    # Self-suspension denied -> 409
    assert (
        client.post(
            f"/api/v1/admin/users/{admin1_id}/suspend",
            json={"reason": "Self suspend attempt"},
            headers=_csrf(client),
        ).status_code
        == 409
    )

    # Validation failure on suspension reason -> 422
    assert (
        client.post(
            f"/api/v1/admin/users/{victim_user.id}/suspend",
            json={"reason": "no"},
            headers=_csrf(client),
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/v1/admin/users/{victim_user.id}/suspend",
            json={"reason": "bad\x00reason"},
            headers=_csrf(client),
        ).status_code
        == 422
    )

    # Suspend victim -> 200
    susp_resp = client.post(
        f"/api/v1/admin/users/{victim_user.id}/suspend",
        json={"reason": "Compromised credentials"},
        headers=_csrf(client),
    )
    assert susp_resp.status_code == 200
    assert susp_resp.json()["is_active"] is False
    assert susp_resp.json()["suspended_reason"] == "Compromised credentials"

    # Victim's SSH key removed from authorized_keys
    assert key_id not in auth_keys_file.read_text(encoding="utf-8")

    # Victim's browser session is immediately invalid (401)
    assert client.get("/api/v1/auth/me", cookies=victim_cookies).status_code == 401

    # Victim's PAT is denied
    async def check_pat_and_repo_access() -> None:
        settings = get_settings()
        async with session_factory() as session:
            with pytest.raises(AuthenticationError):
                await authenticate_personal_access_token(
                    session,
                    settings=settings,
                    username="victim@example.com",
                    raw_token=raw_pat,
                    request_id=None,
                )
            u = await session.get(User, victim_user.id)
            repo = await session.scalar(select(Repository).where(Repository.slug == "v-repo"))
            org = await session.scalar(select(Organization).where(Organization.slug == "v-org"))
            assert u is not None and repo is not None and org is not None
            membership = await session.scalar(
                select(OrganizationMember).where(
                    OrganizationMember.organization_id == org.id,
                    OrganizationMember.user_id == u.id,
                )
            )
            # Fail-closed guard in repository_access_for_actor
            access = repository_access_for_actor(u, membership, repo, None)
            assert access.can_read is False
            assert access.can_write is False
            assert access.can_manage is False
            assert access.viewer_role is None

    asyncio.run(check_pat_and_repo_access())

    # I10: SSH gateway main() catches AuthenticationError with clean stderr & exit 1
    with (
        patch(
            "app.mercurial.ssh_gateway.MercurialSshGateway.run", new_callable=AsyncMock
        ) as mock_run,
        patch("sys.stderr") as mock_stderr,
    ):
        mock_run.side_effect = AuthenticationError("Authentication required.")
        written: list[str] = []
        mock_stderr.write.side_effect = written.append
        rc = ssh_gateway_main([key_id])
        assert rc == 1
        stderr_text = "".join(written)
        assert "Authentication required." in stderr_text
        assert "Traceback" not in stderr_text
        assert "/Users/" not in stderr_text

    # Reactivate victim restores is_active and SSH key
    react_resp = client.post(
        f"/api/v1/admin/users/{victim_user.id}/reactivate",
        headers=_csrf(client),
    )
    assert react_resp.status_code == 200
    assert react_resp.json()["is_active"] is True
    assert react_resp.json()["suspended_at"] is None
    assert key_id in auth_keys_file.read_text(encoding="utf-8")

    # Revoke sessions endpoint
    assert _login(client, email="victim@example.com").status_code == 200
    victim_cookies2 = dict(client.cookies)
    assert _login(client, email="admin1@example.com").status_code == 200
    rev_resp = client.post(
        f"/api/v1/admin/users/{victim_user.id}/revoke-sessions",
        headers=_csrf(client),
    )
    assert rev_resp.status_code == 200
    assert rev_resp.json()["revoked_count"] >= 1
    assert client.get("/api/v1/auth/me", cookies=victim_cookies2).status_code == 401

    # Second platform admin + suspending admin2 kills admin2's active break-glass
    assert _register(client, email="admin2@example.com", display_name="Admin 2").status_code == 200
    admin2_id = _promote_platform_admin(session_factory, "admin2@example.com")
    bg_resp = client.post(
        "/api/v1/admin/break-glass",
        json={
            "org_slug": "v-org",
            "repo_slug": "v-repo",
            "reason": "INC-3000 active session before suspension",
            "minutes": 60,
        },
        headers=_csrf(client),
    )
    assert bg_resp.status_code == 201
    admin2_bg_id = bg_resp.json()["id"]

    # Admin1 suspends Admin2 (succeeds because 2 active admins exist)
    assert _login(client, email="admin1@example.com").status_code == 200
    susp2 = client.post(
        f"/api/v1/admin/users/{admin2_id}/suspend",
        json={"reason": "Admin offboarding"},
        headers=_csrf(client),
    )
    assert susp2.status_code == 200

    # Verify admin2's break-glass was revoked atomically
    async def check_bg_revoked() -> None:
        from uuid import UUID

        async with session_factory() as session:
            bg = await session.get(BreakGlassSession, UUID(admin2_bg_id))
            assert bg is not None
            assert bg.revoked_at is not None

    asyncio.run(check_bg_revoked())

    # Now only 1 active platform admin (admin1) exists -> last-admin guard tested via service
    async def check_last_admin_guard() -> None:
        settings = get_settings()
        async with session_factory() as session:
            admin1 = await session.scalar(select(User).where(User.email == "admin1@example.com"))
            # Pretend another admin actor object tries to suspend the sole active admin in DB
            ghost_actor = User(
                id=uuid4(),
                email="ghost@example.com",
                display_name="Ghost",
                is_active=True,
                is_platform_admin=True,
            )
            assert admin1 is not None
            from app.services.errors import ConflictError

            with pytest.raises(ConflictError, match="last active platform admin"):
                await suspend_user(
                    session,
                    actor=ghost_actor,
                    target_user_id=admin1.id,
                    reason="Trying to suspend sole admin",
                    request_id=None,
                    settings=settings,
                )

    asyncio.run(check_last_admin_guard())


# ---------------------------------------------------------------------------
# 4. Audit Severity, Scope=all & CSV Formula Escaping
# ---------------------------------------------------------------------------


def test_audit_severity_scope_and_csv_escaping(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    assert _register(client, email="user@example.com", display_name="User").status_code == 200
    # Non-platform-admin cannot use scope=all -> 403
    assert client.get("/api/v1/audit", params={"scope": "all"}).status_code == 403

    assert _register(client, email="admin@example.com", display_name="Admin").status_code == 200
    _promote_platform_admin(session_factory, "admin@example.com")

    async def seed_events() -> None:
        async with session_factory() as session:
            u = await session.scalar(select(User).where(User.email == "user@example.com"))
            assert u is not None
            session.add_all(
                [
                    AuditEvent(
                        actor_user_id=u.id,
                        event_type="admin.user.suspended",
                        severity="high",
                        metadata_json={"reason": '  =HYPERLINK("http://evil")'},
                    ),
                    AuditEvent(
                        actor_user_id=u.id,
                        event_type="\t+1+1",
                        severity="normal",
                        metadata_json={},
                    ),
                    AuditEvent(
                        actor_user_id=u.id,
                        event_type="  @SUM(A1:A2)",
                        severity="normal",
                        metadata_json={},
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_events())

    # Platform admin sees global high-severity events with scope=all
    resp = client.get("/api/v1/audit", params={"scope": "all", "severity": "high"})
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert len(events) >= 1
    assert all(e["severity"] == "high" for e in events)
    assert any(e["event_type"] == "admin.user.suspended" for e in events)

    # Category=auth works
    auth_resp = client.get("/api/v1/audit", params={"scope": "all", "category": "auth"})
    assert auth_resp.status_code == 200
    assert any(e["event_type"] == "admin.user.suspended" for e in auth_resp.json()["events"])

    # CSV formula escaping covers leading whitespace and \t / @ / + / =
    csv_resp = client.get("/api/v1/audit", params={"scope": "all", "format": "csv"})
    assert csv_resp.status_code == 200
    assert "'\t+1+1" in csv_resp.text
    assert "'  @SUM(A1:A2)" in csv_resp.text


# ---------------------------------------------------------------------------
# 5. Overview, Health Sanitization, Orgs/Repos Listing & I36 Provisioning Recovery
# ---------------------------------------------------------------------------


def test_admin_overview_health_sanitization_and_provisioning_recovery(
    client: TestClient, session_factory: async_sessionmaker[AsyncSession], tmp_path: Path
) -> None:
    repo_ids = _create_org_and_private_repos(
        client,
        owner_email="owner@example.com",
        org_slug="infra",
        repo_slugs=("ready-repo", "stuck-repo", "archived-repo"),
    )
    assert _register(client, email="admin@example.com", display_name="Admin").status_code == 200
    _promote_platform_admin(session_factory, "admin@example.com")

    # Configure repo states in DB + put non-empty .hg on disk for stuck-repo
    async def setup_repos() -> Path:
        from uuid import UUID

        settings = get_settings()
        locator = RepositoryStorageLocator(settings)
        async with session_factory() as session:
            ready = await session.get(Repository, UUID(repo_ids["ready-repo"]))
            stuck = await session.get(Repository, UUID(repo_ids["stuck-repo"]))
            archived = await session.get(Repository, UUID(repo_ids["archived-repo"]))
            assert ready and stuck and archived

            ready.provisioning_state = RepositoryProvisioningState.READY
            stuck.provisioning_state = RepositoryProvisioningState.PROVISIONING
            stuck.provisioning_started_at = utc_now() - timedelta(minutes=20)
            stuck.provisioning_attempt_id = uuid4()
            archived.provisioning_state = RepositoryProvisioningState.FAILED
            archived.archived_at = utc_now()
            await session.commit()

            stuck_path = locator.prepare_repository_parent(stuck)
            hg_store = stuck_path / ".hg" / "store"
            hg_store.mkdir(parents=True, exist_ok=True)
            sentinel = hg_store / "00changelog.i"
            sentinel.write_bytes(b"real-history-bytes")
            return sentinel

    sentinel_file = asyncio.run(setup_repos())

    # Overview & Health sanitization checks
    overview_resp = client.get("/api/v1/admin/overview")
    assert overview_resp.status_code == 200
    overview = overview_resp.json()
    assert overview["stuck_provisioning"] == 1
    assert overview["organizations"] >= 1
    assert overview["repositories"] == 3
    assert str(tmp_path) not in overview_resp.text
    assert "sqlite" not in overview_resp.text.lower()

    health_resp = client.get("/api/v1/admin/health")
    assert health_resp.status_code == 200
    component_names = {c["name"] for c in health_resp.json()["components"]}
    assert {
        "api",
        "database",
        "ssh_gateway",
        "http_gateway",
        "event_worker",
        "webhook_delivery",
        "storage",
    }.issubset(component_names)
    assert str(tmp_path) not in health_resp.text
    assert "sqlite" not in health_resp.text.lower()
    assert "test-session-secret" not in health_resp.text

    # Admin orgs & repos listing
    orgs_resp = client.get("/api/v1/admin/organizations", params={"q": "infra"})
    assert orgs_resp.status_code == 200
    assert orgs_resp.json()["total"] == 1
    assert orgs_resp.json()["items"][0]["repository_count"] == 3
    assert len(orgs_resp.json()["items"][0]["owners"]) == 1

    repos_resp = client.get("/api/v1/admin/repositories", params={"state": "stuck"})
    assert repos_resp.status_code == 200
    assert repos_resp.json()["total"] == 1
    assert repos_resp.json()["items"][0]["slug"] == "stuck-repo"

    # reset-provisioning refuses READY (409) and ARCHIVED (409)
    assert (
        client.post(
            f"/api/v1/admin/repositories/{repo_ids['ready-repo']}/reset-provisioning",
            headers=_csrf(client),
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/admin/repositories/{repo_ids['archived-repo']}/reset-provisioning",
            headers=_csrf(client),
        ).status_code
        == 409
    )

    # reset-provisioning resets stuck-repo cleanly without touching non-empty .hg
    reset_resp = client.post(
        f"/api/v1/admin/repositories/{repo_ids['stuck-repo']}/reset-provisioning",
        headers=_csrf(client),
    )
    assert reset_resp.status_code == 200
    reset_data = reset_resp.json()
    assert reset_data["provisioning_state"] == "failed"
    assert reset_data["provisioning_error"] == "provisioning_stale"
    assert reset_data["provisioning_started_at"] is None
    assert sentinel_file.exists() and sentinel_file.read_bytes() == b"real-history-bytes"

    # retry-provisioning refuses READY and ARCHIVED (409)
    assert (
        client.post(
            f"/api/v1/admin/repositories/{repo_ids['ready-repo']}/retry-provisioning",
            headers=_csrf(client),
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/admin/repositories/{repo_ids['archived-repo']}/retry-provisioning",
            headers=_csrf(client),
        ).status_code
        == 409
    )

    # Verify high-severity audit event for provisioning reset
    async def verify_reset_audit() -> None:
        async with session_factory() as session:
            evt = await session.scalar(
                select(AuditEvent).where(
                    AuditEvent.event_type == "admin.repository.provisioning_reset"
                )
            )
            assert evt is not None
            assert evt.severity == "high"

    asyncio.run(verify_reset_audit())

    # retry-provisioning succeeds on a failed repo (with no leftover conflict) and emits audit
    async def make_failed_repo() -> str:
        from uuid import UUID

        async with session_factory() as session:
            org = await session.scalar(select(Organization).where(Organization.slug == "infra"))
            owner = await session.scalar(select(User).where(User.email == "owner@example.com"))
            assert org and owner
            failed_repo = Repository(
                organization_id=org.id,
                slug="retry-me",
                display_name="Retry Me",
                provisioning_state=RepositoryProvisioningState.FAILED,
                provisioning_error_code="storage_error",
                created_by_user_id=owner.id,
            )
            session.add(failed_repo)
            await session.commit()
            return str(UUID(str(failed_repo.id)))

    failed_repo_id = asyncio.run(make_failed_repo())
    retry_resp = client.post(
        f"/api/v1/admin/repositories/{failed_repo_id}/retry-provisioning",
        headers=_csrf(client),
    )
    assert retry_resp.status_code == 200
    assert retry_resp.json()["provisioning_state"] == "ready"

    async def verify_retry_audit() -> None:
        async with session_factory() as session:
            evt = await session.scalar(
                select(AuditEvent).where(
                    AuditEvent.event_type == "admin.repository.provisioning_retried"
                )
            )
            assert evt is not None
            assert evt.severity == "high"

    asyncio.run(verify_retry_audit())


def test_migration_0016_upgrade_and_downgrade() -> None:
    import importlib.util

    import sqlalchemy as sa

    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    mig_path = (
        Path(__file__).resolve().parents[1]
        / "alembic/versions/0016_platform_admin_and_break_glass.py"
    )
    spec = importlib.util.spec_from_file_location("migration_0016", mig_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL)"))
        conn.execute(
            sa.text("CREATE TABLE organizations (id TEXT PRIMARY KEY, slug TEXT NOT NULL)")
        )
        conn.execute(sa.text("CREATE TABLE repositories (id TEXT PRIMARY KEY, slug TEXT NOT NULL)"))
        conn.execute(
            sa.text("CREATE TABLE audit_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL)")
        )
        with Operations.context(MigrationContext.configure(conn)):
            module.upgrade()

        inspector = sa.inspect(conn)
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        assert {"is_platform_admin", "suspended_at", "suspended_reason"}.issubset(user_cols)
        audit_cols = {c["name"] for c in inspector.get_columns("audit_events")}
        assert "severity" in audit_cols
        assert "break_glass_sessions" in inspector.get_table_names()

        with Operations.context(MigrationContext.configure(conn)):
            module.downgrade()

        inspector_after = sa.inspect(conn)
        assert "break_glass_sessions" not in inspector_after.get_table_names()
        assert "severity" not in {c["name"] for c in inspector_after.get_columns("audit_events")}
        assert "is_platform_admin" not in {c["name"] for c in inspector_after.get_columns("users")}
    engine.dispose()
