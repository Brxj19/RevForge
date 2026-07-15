from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.enums import OrganizationRole
from app.models.audit_event import AuditEvent
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.user_password_credential import UserPasswordCredential

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client,
    *,
    email: str = "owner@example.com",
    display_name: str = "Owner User",
    password: str = "StrongPassword123",
):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": display_name, "password": password},
    )


def _login(
    client,
    *,
    email: str = "owner@example.com",
    password: str = "StrongPassword123",
):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _run_query(session_factory: async_sessionmaker[AsyncSession], statement):
    async def runner():
        async with session_factory() as session:
            return await session.scalar(statement)

    return asyncio.run(runner())


def _run_scalars(session_factory: async_sessionmaker[AsyncSession], statement):
    async def runner():
        async with session_factory() as session:
            result = await session.execute(statement)
            return list(result.scalars())

    return asyncio.run(runner())


def test_registration_stores_password_hash_and_session_cookie(client, session_factory) -> None:
    response = _register(client)

    assert response.status_code == 201
    assert response.json()["user"]["email"] == "owner@example.com"
    assert "revforge_session" in response.cookies
    assert "revforge_csrf" in response.cookies

    credential = _run_query(
        session_factory,
        select(UserPasswordCredential).join(UserPasswordCredential.user),
    )
    assert credential is not None
    assert credential.password_hash != "StrongPassword123"
    assert "StrongPassword123" not in credential.password_hash


def test_duplicate_email_is_rejected(client) -> None:
    assert _register(client).status_code == 201

    duplicate = _register(client)

    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["message"] == "Email is already registered."


def test_login_and_logout_flow(client) -> None:
    _register(client)
    client.cookies.clear()

    invalid = _login(client, password="wrong-password")
    assert invalid.status_code == 401
    assert invalid.json()["error"]["message"] == "Invalid email or password."

    login = _login(client)
    assert login.status_code == 200

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Owner User"

    logout = client.post("/api/v1/auth/logout", headers=_csrf_headers(client))
    assert logout.status_code == 204

    after_logout = client.get("/api/v1/auth/me")
    assert after_logout.status_code == 401


def test_csrf_is_required_for_state_changes(client) -> None:
    _register(client)

    without_csrf = client.post(
        "/api/v1/organizations",
        json={"slug": "acme", "display_name": "Acme", "description": "Test org"},
        headers=ORIGIN_HEADERS,
    )

    assert without_csrf.status_code == 403
    assert without_csrf.json()["error"]["message"] == "CSRF validation failed."


def test_organization_creation_and_last_owner_protection(client, session_factory) -> None:
    _register(client)
    create_org = client.post(
        "/api/v1/organizations",
        json={"slug": "acme", "display_name": "Acme Corp", "description": "Forge team"},
        headers=_csrf_headers(client),
    )
    assert create_org.status_code == 201
    org = create_org.json()
    assert org["viewer_role"] == "owner"
    assert org["member_count"] == 1

    other_user = _register(
        client,
        email="admin@example.com",
        display_name="Admin User",
        password="AdminPassword123",
    )
    assert other_user.status_code == 201

    owner_login = _login(client)
    assert owner_login.status_code == 200

    add_member = client.post(
        "/api/v1/organizations/acme/members",
        json={"user": "Admin User", "role": "admin"},
        headers=_csrf_headers(client),
    )
    assert add_member.status_code == 201

    member_id = add_member.json()["id"]
    members = client.get("/api/v1/organizations/acme/members")
    assert members.status_code == 200
    owner_member_id = next(
        member["id"] for member in members.json() if member["user_email"] == "owner@example.com"
    )
    last_owner_demotion = client.patch(
        f"/api/v1/organizations/acme/members/{owner_member_id}",
        json={"role": "admin"},
        headers=_csrf_headers(client),
    )
    assert last_owner_demotion.status_code == 409

    owner_members = _run_scalars(
        session_factory,
        select(OrganizationMember).where(OrganizationMember.role == OrganizationRole.OWNER),
    )
    assert len(owner_members) == 1
    assert member_id != org["id"]


def test_repository_visibility_permissions_and_cross_org_isolation(client, session_factory) -> None:
    _register(client)
    client.post(
        "/api/v1/organizations",
        json={"slug": "acme", "display_name": "Acme Corp", "description": None},
        headers=_csrf_headers(client),
    )

    _register(
        client,
        email="member@example.com",
        display_name="Member User",
        password="MemberPassword123",
    )
    _login(client)
    member_add_response = client.post(
        "/api/v1/organizations/acme/members",
        json={"user": "member@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert member_add_response.status_code == 201
    private_repo = client.post(
        "/api/v1/organizations/acme/repositories",
        json={
            "slug": "private-repo",
            "display_name": "Private Repo",
            "description": "Private",
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    internal_repo = client.post(
        "/api/v1/organizations/acme/repositories",
        json={
            "slug": "internal-repo",
            "display_name": "Internal Repo",
            "description": "Internal",
            "visibility": "internal",
        },
        headers=_csrf_headers(client),
    )
    public_repo = client.post(
        "/api/v1/organizations/acme/repositories",
        json={
            "slug": "public-repo",
            "display_name": "Public Repo",
            "description": "Public",
            "visibility": "public",
        },
        headers=_csrf_headers(client),
    )
    assert private_repo.status_code == 201
    assert internal_repo.status_code == 201
    assert public_repo.status_code == 201

    client.cookies.clear()
    anon_list = client.get("/api/v1/organizations/acme/repositories")
    assert anon_list.status_code == 200
    assert [repo["slug"] for repo in anon_list.json()] == ["public-repo"]

    assert (
        _login(client, email="member@example.com", password="MemberPassword123").status_code == 200
    )
    member_list = client.get("/api/v1/organizations/acme/repositories")
    member_slugs = [repo["slug"] for repo in member_list.json()]
    assert "internal-repo" in member_slugs
    assert "private-repo" not in member_slugs

    private_denied = client.get("/api/v1/organizations/acme/repositories/private-repo")
    assert private_denied.status_code == 404

    assert _login(client).status_code == 200
    permissions = client.put(
        "/api/v1/organizations/acme/repositories/private-repo/permissions",
        json={"user": "Member User", "role": "read"},
        headers=_csrf_headers(client),
    )
    assert permissions.status_code == 200

    assert (
        _login(client, email="member@example.com", password="MemberPassword123").status_code == 200
    )
    private_allowed = client.get("/api/v1/organizations/acme/repositories/private-repo")
    assert private_allowed.status_code == 200
    assert private_allowed.json()["viewer_role"] == "read"
    assert private_allowed.json()["phase_status"] == "Mercurial repository not provisioned yet."

    assert _login(client).status_code == 200
    assert (
        client.post(
            "/api/v1/organizations",
            json={"slug": "beta", "display_name": "Beta Corp", "description": None},
            headers=_csrf_headers(client),
        ).status_code
        == 201
    )
    second_slug = client.post(
        "/api/v1/organizations/beta/repositories",
        json={
            "slug": "private-repo",
            "display_name": "Private Repo",
            "description": "Second org",
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    assert second_slug.status_code == 201

    assert (
        _login(client, email="member@example.com", password="MemberPassword123").status_code == 200
    )
    beta_denied = client.get("/api/v1/organizations/beta/repositories/private-repo")
    assert beta_denied.status_code == 404

    assert _login(client).status_code == 200
    member_listing = client.get("/api/v1/organizations/acme/members")
    member_record = next(
        member for member in member_listing.json() if member["user_email"] == "member@example.com"
    )
    remove_member = client.delete(
        f"/api/v1/organizations/acme/members/{member_record['id']}",
        headers=_csrf_headers(client),
    )
    assert remove_member.status_code == 204

    assert (
        _login(client, email="member@example.com", password="MemberPassword123").status_code == 200
    )
    offboarded_access = client.get("/api/v1/organizations/acme/repositories/private-repo")
    assert offboarded_access.status_code == 404

    repositories = _run_scalars(
        session_factory,
        select(Repository).where(Repository.slug == "private-repo"),
    )
    assert len(repositories) == 2
    assert all(not hasattr(repository, "filesystem_path") for repository in repositories)


def test_audit_events_are_recorded_for_control_plane_changes(client, session_factory) -> None:
    _register(client)
    client.post(
        "/api/v1/organizations",
        json={"slug": "audit", "display_name": "Audit Org", "description": None},
        headers=_csrf_headers(client),
    )
    client.post(
        "/api/v1/organizations/audit/repositories",
        json={
            "slug": "repo",
            "display_name": "Repo",
            "description": None,
            "visibility": "public",
        },
        headers=_csrf_headers(client),
    )

    events = _run_scalars(session_factory, select(AuditEvent).order_by(AuditEvent.created_at.asc()))
    event_types = [event.event_type for event in events]

    assert "user.registered" in event_types
    assert "organization.created" in event_types
    assert "repository.created" in event_types
    assert "user.logged_in" in event_types
    assert all("password" not in str(event.metadata_json).lower() for event in events)
    assert all("token" not in str(event.metadata_json).lower() for event in events)


def test_audit_activity_endpoint_supports_offset_pagination(client) -> None:
    _register(client)
    client.post(
        "/api/v1/organizations",
        json={"slug": "audit", "display_name": "Audit Org", "description": None},
        headers=_csrf_headers(client),
    )
    client.post(
        "/api/v1/organizations/audit/repositories",
        json={
            "slug": "repo-one",
            "display_name": "Repo One",
            "description": None,
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    client.post(
        "/api/v1/organizations/audit/repositories",
        json={
            "slug": "repo-two",
            "display_name": "Repo Two",
            "description": None,
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )

    first_page = client.get("/api/v1/audit?limit=1")
    second_page = client.get("/api/v1/audit?limit=1&offset=1")

    assert first_page.status_code == 200
    assert second_page.status_code == 200
    first_payload = first_page.json()
    second_payload = second_page.json()
    assert first_payload["total_count"] >= 3
    assert second_payload["total_count"] == first_payload["total_count"]
    assert len(first_payload["events"]) == 1
    assert len(second_payload["events"]) == 1
    assert first_payload["events"][0]["id"] != second_payload["events"][0]["id"]


def test_repository_slug_rename_and_archived_delete_flow(client, session_factory) -> None:
    _register(client)
    client.post(
        "/api/v1/organizations",
        json={"slug": "rename", "display_name": "Rename Org", "description": None},
        headers=_csrf_headers(client),
    )
    create_repository = client.post(
        "/api/v1/organizations/rename/repositories",
        json={
            "slug": "before-slug",
            "display_name": "Before Slug",
            "description": None,
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    assert create_repository.status_code == 201

    rename_repository = client.patch(
        "/api/v1/organizations/rename/repositories/before-slug",
        json={"slug": "after-slug"},
        headers=_csrf_headers(client),
    )
    assert rename_repository.status_code == 200
    assert rename_repository.json()["slug"] == "after-slug"

    old_route = client.get("/api/v1/organizations/rename/repositories/before-slug")
    assert old_route.status_code == 404

    renamed_route = client.get("/api/v1/organizations/rename/repositories/after-slug")
    assert renamed_route.status_code == 200

    delete_without_archive = client.delete(
        "/api/v1/organizations/rename/repositories/after-slug",
        headers=_csrf_headers(client),
    )
    assert delete_without_archive.status_code == 409

    archive_repository = client.patch(
        "/api/v1/organizations/rename/repositories/after-slug",
        json={"archived": True},
        headers=_csrf_headers(client),
    )
    assert archive_repository.status_code == 200

    delete_repository = client.delete(
        "/api/v1/organizations/rename/repositories/after-slug",
        headers=_csrf_headers(client),
    )
    assert delete_repository.status_code == 204

    deleted_record = _run_query(
        session_factory, select(Repository).where(Repository.slug == "after-slug")
    )
    assert deleted_record is None
