from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import (
    get_hg_command_runner,
    get_mercurial_read_service,
    get_repository_storage_locator,
)
from app.core.config import get_settings
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.audit_event import AuditEvent
from app.models.repository import Repository
from app.models.user import User

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
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


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


def _create_organization(client, slug: str) -> None:
    response = client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 201


def _create_repository(
    client,
    organization_slug: str,
    slug: str,
    visibility: str = "public",
) -> None:
    response = client.post(
        f"/api/v1/organizations/{organization_slug}/repositories",
        json={
            "slug": slug,
            "display_name": slug.replace("-", " ").title(),
            "description": "Mercurial test repository",
            "visibility": visibility,
        },
        headers=_csrf_headers(client),
    )
    assert response.status_code == 201


def _repository_record(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    slug: str,
) -> Repository:
    repository = _run_query(
        session_factory,
        select(Repository).where(Repository.slug == slug),
    )
    assert repository is not None
    return repository


def _user_record(session_factory: async_sessionmaker[AsyncSession], *, email: str) -> User:
    user = _run_query(session_factory, select(User).where(User.email == email))
    assert user is not None
    return user


def _repository_path(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    slug: str,
) -> Path:
    locator = RepositoryStorageLocator(get_settings())
    return locator.repository_path(_repository_record(session_factory, slug=slug))


def _hg_env() -> dict[str, str]:
    return {
        "HGPLAIN": "1",
        "HGRCPATH": "",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PATH": os.environ.get("PATH", ""),
    }


def _hg(repository_path: Path, *args: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["hg", "--repository", str(repository_path), *args],
        check=True,
        cwd=repository_path,
        env=_hg_env(),
        capture_output=True,
    )


def _seed_repository(repository_path: Path) -> None:
    (repository_path / "src").mkdir(parents=True, exist_ok=True)
    (repository_path / "assets").mkdir(parents=True, exist_ok=True)
    (repository_path / "docs").mkdir(parents=True, exist_ok=True)
    (repository_path / "src" / "hello.py").write_text("print('hello revforge')\n", encoding="utf-8")
    _hg(repository_path, "add", "src/hello.py")
    _hg(
        repository_path,
        "commit",
        "-u",
        "Alice Example <alice@example.com>",
        "-m",
        "Initial import",
    )
    _hg(repository_path, "bookmark", "main")
    _hg(repository_path, "tag", "-u", "Alice Example <alice@example.com>", "v1.0")

    (repository_path / "assets" / "binary.bin").write_bytes(b"\x00REVFORGE")
    (repository_path / "src" / "hello.py").write_text(
        "print('hello revforge')\nprint('history ready')\n",
        encoding="utf-8",
    )
    _hg(repository_path, "add", "assets/binary.bin")
    _hg(
        repository_path,
        "commit",
        "-u",
        "Alice Example <alice@example.com>",
        "-m",
        "Add binary artifact",
    )

    _hg(repository_path, "branch", "release")
    (repository_path / "docs" / "large.txt").write_text("large-line\n" * 7000, encoding="utf-8")
    _hg(repository_path, "add", "docs/large.txt")
    _hg(
        repository_path,
        "commit",
        "-u",
        "Alice Example <alice@example.com>",
        "-m",
        "Prepare release snapshot",
    )


class _ExplodingRunner:
    async def run(self, *args, **kwargs):  # pragma: no cover - assertion path only
        raise AssertionError("Mercurial runner should not be invoked.")

    async def run_json(self, *args, **kwargs):  # pragma: no cover - assertion path only
        raise AssertionError("Mercurial runner should not be invoked.")


class _ExplodingStorageLocator:
    def repository_path(self, repository):  # pragma: no cover - assertion path only
        raise AssertionError("Repository storage should not be resolved.")

    def prepare_repository_parent(self, repository):  # pragma: no cover - assertion path only
        raise AssertionError("Repository storage should not be resolved.")


class _ExplodingReadService:
    async def list_changesets(self, *args, **kwargs):  # pragma: no cover - assertion path only
        raise AssertionError("Mercurial read service should not be invoked.")

    async def get_changeset(self, *args, **kwargs):  # pragma: no cover - assertion path only
        raise AssertionError("Mercurial read service should not be invoked.")

    async def get_diff(self, *args, **kwargs):  # pragma: no cover - assertion path only
        raise AssertionError("Mercurial read service should not be invoked.")

    async def browse(self, *args, **kwargs):  # pragma: no cover - assertion path only
        raise AssertionError("Mercurial read service should not be invoked.")

    async def list_refs(self, *args, **kwargs):  # pragma: no cover - assertion path only
        raise AssertionError("Mercurial read service should not be invoked.")


def test_public_repository_provisioning_and_read_only_browser(
    client,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    _register(client)
    _create_organization(client, "acme")
    _create_repository(client, "acme", "public-repo", "public")

    repository_detail = client.get("/api/v1/organizations/acme/repositories/public-repo")
    assert repository_detail.status_code == 200
    assert repository_detail.json()["provisioning_state"] == "unprovisioned"
    assert repository_detail.json()["is_browsable"] is False
    assert "storage_path" not in repository_detail.text

    provision = client.post(
        "/api/v1/organizations/acme/repositories/public-repo/provision",
        headers=_csrf_headers(client),
    )
    assert provision.status_code == 200
    assert provision.json()["provisioning_state"] == "ready"
    assert provision.json()["is_browsable"] is True

    repository_path = _repository_path(session_factory, slug="public-repo")
    repository = _repository_record(session_factory, slug="public-repo")
    assert repository_path.is_relative_to(Path(get_settings().repository_root).resolve())
    assert str(repository.organization_id) in str(repository_path)
    assert str(repository.id) in str(repository_path)
    assert (repository_path / ".hg").is_dir()

    empty_history = client.get("/api/v1/organizations/acme/repositories/public-repo/changesets")
    assert empty_history.status_code == 200
    assert empty_history.json() == {"changesets": [], "next_cursor": None}

    empty_browse = client.get("/api/v1/organizations/acme/repositories/public-repo/browse")
    assert empty_browse.status_code == 200
    assert empty_browse.json() == {"kind": "directory", "revision": "", "path": "", "entries": []}

    _seed_repository(repository_path)
    client.cookies.clear()

    history = client.get("/api/v1/organizations/acme/repositories/public-repo/changesets")
    assert history.status_code == 200
    history_payload = history.json()
    assert len(history_payload["changesets"]) == 2
    assert history_payload["next_cursor"] is not None

    second_page = client.get(
        "/api/v1/organizations/acme/repositories/public-repo/changesets",
        params={"cursor": history_payload["next_cursor"]},
    )
    assert second_page.status_code == 200
    assert len(second_page.json()["changesets"]) >= 1

    latest_node = history_payload["changesets"][0]["node"]
    detail = client.get(
        f"/api/v1/organizations/acme/repositories/public-repo/changesets/{latest_node}"
    )
    assert detail.status_code == 200
    assert detail.json()["branch"] == "release"
    assert "docs/large.txt" in detail.json()["files_changed"]

    diff = client.get(
        f"/api/v1/organizations/acme/repositories/public-repo/changesets/{latest_node}/diff"
    )
    assert diff.status_code == 200
    assert diff.json()["is_truncated"] is True
    assert diff.json()["truncation_reason_when_applicable"] == "diff_too_large"

    root_browse = client.get("/api/v1/organizations/acme/repositories/public-repo/browse")
    assert root_browse.status_code == 200
    root_entries = {entry["name"]: entry["kind"] for entry in root_browse.json()["entries"]}
    assert root_entries["src"] == "directory"
    assert root_entries["assets"] == "directory"
    assert root_entries["docs"] == "directory"

    source_file = client.get(
        "/api/v1/organizations/acme/repositories/public-repo/browse",
        params={"path": "src/hello.py", "revision": latest_node},
    )
    assert source_file.status_code == 200
    assert source_file.json()["kind"] == "file"
    assert "history ready" in source_file.json()["content"]

    binary_file = client.get(
        "/api/v1/organizations/acme/repositories/public-repo/browse",
        params={"path": "assets/binary.bin", "revision": latest_node},
    )
    assert binary_file.status_code == 200
    assert binary_file.json()["is_binary"] is True
    assert binary_file.json()["content"] is None

    large_file = client.get(
        "/api/v1/organizations/acme/repositories/public-repo/browse",
        params={"path": "docs/large.txt", "revision": latest_node},
    )
    assert large_file.status_code == 200
    assert large_file.json()["is_too_large"] is True
    assert large_file.json()["content"] is None

    refs = client.get("/api/v1/organizations/acme/repositories/public-repo/refs")
    assert refs.status_code == 200
    refs_payload = refs.json()
    assert any(ref["name"] == "default" for ref in refs_payload["branches"])
    assert any(ref["name"] == "release" for ref in refs_payload["branches"])
    assert any(ref["name"] == "v1.0" for ref in refs_payload["tags"])
    assert any(ref["name"] == "main" for ref in refs_payload["bookmarks"])
    assert str(repository_path) not in refs.text

    events = _run_scalars(session_factory, select(AuditEvent).order_by(AuditEvent.created_at.asc()))
    event_types = [event.event_type for event in events]
    assert "repository.provision_requested" in event_types
    assert "repository.provisioned" in event_types
    assert all(str(repository_path) not in str(event.metadata_json) for event in events)


def test_provisioning_denials_do_not_invoke_mercurial_dependencies(
    client,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    _register(client)
    _create_organization(client, "secure")
    _create_repository(client, "secure", "private-repo", "private")
    _register(
        client,
        email="member@example.com",
        display_name="Member User",
        password="MemberPassword123",
    )
    _login(client)
    add_member = client.post(
        "/api/v1/organizations/secure/members",
        json={"email": "member@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert add_member.status_code == 201

    client.app.dependency_overrides[get_hg_command_runner] = lambda: _ExplodingRunner()
    client.app.dependency_overrides[get_repository_storage_locator] = (
        lambda: _ExplodingStorageLocator()
    )
    client.app.dependency_overrides[get_mercurial_read_service] = lambda: _ExplodingReadService()
    try:
        client.cookies.clear()
        anonymous_provision = client.post(
            "/api/v1/organizations/secure/repositories/private-repo/provision",
            headers=ORIGIN_HEADERS,
        )
        assert anonymous_provision.status_code == 401

        assert (
            _login(client, email="member@example.com", password="MemberPassword123").status_code
            == 200
        )
        denied_provision = client.post(
            "/api/v1/organizations/secure/repositories/private-repo/provision",
            headers=_csrf_headers(client),
        )
        assert denied_provision.status_code == 404

        denied_browse = client.get("/api/v1/organizations/secure/repositories/private-repo/browse")
        assert denied_browse.status_code == 404
    finally:
        client.app.dependency_overrides.pop(get_hg_command_runner, None)
        client.app.dependency_overrides.pop(get_repository_storage_locator, None)
        client.app.dependency_overrides.pop(get_mercurial_read_service, None)

    repository = _repository_record(session_factory, slug="private-repo")
    assert repository.provisioned_at is None


def test_repository_admin_can_provision_idempotently_and_archived_repo_is_blocked(
    client,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    _register(client)
    _create_organization(client, "phase2")
    _create_repository(client, "phase2", "admin-repo", "private")
    _register(
        client,
        email="admin@example.com",
        display_name="Repo Admin",
        password="AdminPassword123",
    )
    _login(client)
    add_member = client.post(
        "/api/v1/organizations/phase2/members",
        json={"email": "admin@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert add_member.status_code == 201
    grant_admin = client.put(
        f"/api/v1/organizations/phase2/repositories/admin-repo/permissions/{add_member.json()['user_id']}",
        json={"role": "admin"},
        headers=_csrf_headers(client),
    )
    assert grant_admin.status_code == 200

    assert _login(client, email="admin@example.com", password="AdminPassword123").status_code == 200
    first = client.post(
        "/api/v1/organizations/phase2/repositories/admin-repo/provision",
        headers=_csrf_headers(client),
    )
    assert first.status_code == 200
    assert first.json()["provisioning_state"] == "ready"

    second = client.post(
        "/api/v1/organizations/phase2/repositories/admin-repo/provision",
        headers=_csrf_headers(client),
    )
    assert second.status_code == 200
    assert second.json()["provisioning_state"] == "ready"

    assert _login(client).status_code == 200
    _create_repository(client, "phase2", "archived-repo", "public")
    archive = client.patch(
        "/api/v1/organizations/phase2/repositories/archived-repo",
        json={"archived": True},
        headers=_csrf_headers(client),
    )
    assert archive.status_code == 200

    archived_provision = client.post(
        "/api/v1/organizations/phase2/repositories/archived-repo/provision",
        headers=_csrf_headers(client),
    )
    assert archived_provision.status_code == 409
    assert (
        archived_provision.json()["error"]["message"]
        == "Archived repositories cannot be provisioned."
    )

    admin_repository = _repository_record(session_factory, slug="admin-repo")
    archived_repository = _repository_record(session_factory, slug="archived-repo")
    assert admin_repository.provisioned_at is not None
    assert archived_repository.provisioned_at is None


def test_internal_and_private_read_authorization(client) -> None:
    _register(client)
    _create_organization(client, "visibility")
    _create_repository(client, "visibility", "internal-repo", "internal")
    _create_repository(client, "visibility", "private-repo", "private")
    client.post(
        "/api/v1/organizations/visibility/repositories/internal-repo/provision",
        headers=_csrf_headers(client),
    )
    client.post(
        "/api/v1/organizations/visibility/repositories/private-repo/provision",
        headers=_csrf_headers(client),
    )
    _register(
        client,
        email="reader@example.com",
        display_name="Reader",
        password="ReaderPassword123",
    )
    _login(client)
    add_member = client.post(
        "/api/v1/organizations/visibility/members",
        json={"email": "reader@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert add_member.status_code == 201

    client.cookies.clear()
    assert (
        client.get("/api/v1/organizations/visibility/repositories/internal-repo/browse").status_code
        == 404
    )
    assert (
        client.get("/api/v1/organizations/visibility/repositories/private-repo/browse").status_code
        == 404
    )

    assert (
        _login(client, email="reader@example.com", password="ReaderPassword123").status_code == 200
    )
    internal_browse = client.get(
        "/api/v1/organizations/visibility/repositories/internal-repo/browse"
    )
    assert internal_browse.status_code == 200

    private_denied = client.get("/api/v1/organizations/visibility/repositories/private-repo/browse")
    assert private_denied.status_code == 404

    assert _login(client).status_code == 200
    grant_write = client.put(
        f"/api/v1/organizations/visibility/repositories/private-repo/permissions/{add_member.json()['user_id']}",
        json={"role": "write"},
        headers=_csrf_headers(client),
    )
    assert grant_write.status_code == 200

    assert (
        _login(client, email="reader@example.com", password="ReaderPassword123").status_code == 200
    )
    private_allowed = client.get(
        "/api/v1/organizations/visibility/repositories/private-repo/browse"
    )
    assert private_allowed.status_code == 200


def test_invalid_revision_and_path_inputs_are_rejected(
    client,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    _register(client)
    _create_organization(client, "safety")
    _create_repository(client, "safety", "repo", "public")
    provision = client.post(
        "/api/v1/organizations/safety/repositories/repo/provision",
        headers=_csrf_headers(client),
    )
    assert provision.status_code == 200

    repository_path = _repository_path(session_factory, slug="repo")
    _seed_repository(repository_path)
    latest_node = client.get("/api/v1/organizations/safety/repositories/repo/changesets").json()[
        "changesets"
    ][0]["node"]

    invalid_revision = client.get(
        "/api/v1/organizations/safety/repositories/repo/browse",
        params={"revision": "tip()", "path": "src/hello.py"},
    )
    assert invalid_revision.status_code == 422

    invalid_node = client.get("/api/v1/organizations/safety/repositories/repo/changesets/tip()")
    assert invalid_node.status_code == 422

    traversal = client.get(
        "/api/v1/organizations/safety/repositories/repo/browse",
        params={"revision": latest_node, "path": "../etc/passwd"},
    )
    assert traversal.status_code == 422

    hg_dir = client.get(
        "/api/v1/organizations/safety/repositories/repo/browse",
        params={"revision": latest_node, "path": ".hg/store"},
    )
    assert hg_dir.status_code == 422

    unknown_revision = client.get(
        "/api/v1/organizations/safety/repositories/repo/browse",
        params={"revision": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "path": "src/hello.py"},
    )
    assert unknown_revision.status_code == 404


def test_provisioning_audit_events_do_not_leak_absolute_storage_paths(
    client,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    _register(client)
    _create_organization(client, "audit")
    _create_repository(client, "audit", "repo", "public")

    provision = client.post(
        "/api/v1/organizations/audit/repositories/repo/provision",
        headers=_csrf_headers(client),
    )
    assert provision.status_code == 200

    repository_path = _repository_path(session_factory, slug="repo")
    repository = _repository_record(session_factory, slug="repo")
    events = _run_scalars(
        session_factory,
        select(AuditEvent).where(AuditEvent.repository_id == repository.id),
    )
    assert [event.event_type for event in events].count("repository.provision_requested") == 1
    assert [event.event_type for event in events].count("repository.provisioned") == 1
    assert all(str(repository_path) not in str(event.metadata_json) for event in events)
