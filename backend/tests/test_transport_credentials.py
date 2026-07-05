from __future__ import annotations

import contextlib
import os
import shutil
import subprocess
import tempfile
import threading
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import quote
from wsgiref.simple_server import make_server

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.mercurial.http_gateway import TransportCommandKind, classify_hg_http_command
from app.mercurial.http_gateway_service import create_http_gateway_application
from app.mercurial.ssh_gateway import parse_ssh_original_command

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


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _run_query(session_factory: async_sessionmaker[AsyncSession], statement):
    async def runner():
        async with session_factory() as session:
            return await session.scalar(statement)

    import asyncio

    return asyncio.run(runner())


@contextlib.contextmanager
def _serve_wsgi_app(app) -> Iterator[tuple[str, int]]:
    server = make_server("127.0.0.1", 0, app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "127.0.0.1", server.server_port
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def _hg_env() -> dict[str, str]:
    return {
        "HGPLAIN": "1",
        "HGRCPATH": "",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PATH": os.environ.get("PATH", ""),
    }


def _hg(repository_path: Path, *args: str, env: dict[str, str] | None = None):
    command_env = _hg_env()
    if env is not None:
        command_env.update(env)
    return subprocess.run(
        ["hg", "--repository", str(repository_path), *args],
        check=True,
        cwd=repository_path,
        env=command_env,
        capture_output=True,
        text=True,
    )


def _seed_repository(repository_path: Path) -> None:
    (repository_path / "src").mkdir(parents=True, exist_ok=True)
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


def _create_org_and_repo(client, slug: str, visibility: str = "public") -> None:
    create_org = client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=_csrf_headers(client),
    )
    assert create_org.status_code == 201
    create_repo = client.post(
        f"/api/v1/organizations/{slug}/repositories",
        json={
            "slug": "public-repo",
            "display_name": "Public Repo",
            "description": "Transport test repository",
            "visibility": visibility,
        },
        headers=_csrf_headers(client),
    )
    assert create_repo.status_code == 201

    provision = client.post(
        f"/api/v1/organizations/{slug}/repositories/public-repo/provision",
        headers=_csrf_headers(client),
    )
    assert provision.status_code == 200


def test_transport_credential_lifecycle(client, session_factory) -> None:
    _register(client)

    token_create = client.post(
        "/api/v1/me/tokens",
        json={"name": "Local Clone", "capability": "write"},
        headers=_csrf_headers(client),
    )
    assert token_create.status_code == 201
    token = token_create.json()
    assert token["plaintext_token"]

    token_list = client.get("/api/v1/me/tokens")
    assert token_list.status_code == 200
    assert token_list.json()[0]["name"] == "Local Clone"

    token_revoke = client.delete(
        f"/api/v1/me/tokens/{token['id']}",
        headers=_csrf_headers(client),
    )
    assert token_revoke.status_code == 204

    ssh_key_dir = Path(tempfile.mkdtemp(prefix="revforge-ssh-key-"))
    try:
        key_path = ssh_key_dir / "id_ed25519"
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-N", "", "-f", str(key_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        public_key = key_path.with_suffix(".pub").read_text(encoding="utf-8").strip()
        key_create = client.post(
            "/api/v1/me/ssh-keys",
            json={"label": "Laptop", "public_key": public_key},
            headers=_csrf_headers(client),
        )
        assert key_create.status_code == 201
        assert key_create.json()["fingerprint_sha256"].startswith("SHA256:")

        ssh_list = client.get("/api/v1/me/ssh-keys")
        assert ssh_list.status_code == 200
        assert ssh_list.json()[0]["label"] == "Laptop"
    finally:
        shutil.rmtree(ssh_key_dir, ignore_errors=True)


def test_http_gateway_supports_clone_and_push(client, session_factory, tmp_path) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "public")

    from app.mercurial.storage_locator import RepositoryStorageLocator
    from app.models.repository import Repository

    repo = _run_query(session_factory, select(Repository).where(Repository.slug == "public-repo"))
    assert repo is not None
    repo_path = RepositoryStorageLocator(get_settings()).repository_path(repo)
    assert repo_path.exists()
    _seed_repository(repo_path)

    token_create = client.post(
        "/api/v1/me/tokens",
        json={"name": "Write Token", "capability": "write"},
        headers=_csrf_headers(client),
    )
    assert token_create.status_code == 201
    token = token_create.json()["plaintext_token"]
    owner_email = quote("owner@example.com", safe="")

    gateway = create_http_gateway_application(
        settings=get_settings(),
        session_factory_getter=lambda: session_factory,
    )

    with _serve_wsgi_app(gateway) as (host, port):
        clone_dir = tmp_path / "clone"
        clone_url = f"http://{host}:{port}/acme/public-repo"
        clone = subprocess.run(
            ["hg", "clone", clone_url, str(clone_dir)],
            env=_hg_env(),
            capture_output=True,
            text=True,
        )
        assert clone.returncode == 0, clone.stderr
        assert (clone_dir / "src" / "hello.py").is_file()

        (clone_dir / "src" / "hello.py").write_text(
            "print('hello revforge')\nprint('transported')\n",
            encoding="utf-8",
        )
        subprocess.run(
            [
                "hg",
                "--repository",
                str(clone_dir),
                "commit",
                "-u",
                "Owner User <owner@example.com>",
                "-m",
                "Transport push",
            ],
            check=True,
            env=_hg_env(),
            capture_output=True,
            text=True,
        )

        push = subprocess.run(
            [
                "hg",
                "--repository",
                str(clone_dir),
                "push",
                f"http://{owner_email}:{token}@{host}:{port}/acme/public-repo",
            ],
            env=_hg_env(),
            capture_output=True,
            text=True,
        )
        assert push.returncode == 0, push.stderr

    changesets = client.get("/api/v1/organizations/acme/repositories/public-repo/changesets")
    assert changesets.status_code == 200
    assert len(changesets.json()["changesets"]) >= 2


def test_http_gateway_rejects_read_only_push(client, session_factory, tmp_path) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "public")

    from app.mercurial.storage_locator import RepositoryStorageLocator
    from app.models.repository import Repository

    repo = _run_query(session_factory, select(Repository).where(Repository.slug == "public-repo"))
    assert repo is not None
    repo_path = RepositoryStorageLocator(get_settings()).repository_path(repo)
    assert repo_path.exists()
    _seed_repository(repo_path)

    token_create = client.post(
        "/api/v1/me/tokens",
        json={"name": "Read Token", "capability": "read"},
        headers=_csrf_headers(client),
    )
    assert token_create.status_code == 201
    token = token_create.json()["plaintext_token"]
    owner_email = quote("owner@example.com", safe="")

    gateway = create_http_gateway_application(
        settings=get_settings(),
        session_factory_getter=lambda: session_factory,
    )

    with _serve_wsgi_app(gateway) as (host, port):
        clone_dir = tmp_path / "clone-read"
        clone_url = f"http://{host}:{port}/acme/public-repo"
        clone = subprocess.run(
            ["hg", "clone", clone_url, str(clone_dir)],
            env=_hg_env(),
            capture_output=True,
            text=True,
        )
        assert clone.returncode == 0, clone.stderr
        (clone_dir / "src" / "hello.py").write_text(
            "print('hello revforge')\nprint('blocked push')\n",
            encoding="utf-8",
        )
        subprocess.run(
            [
                "hg",
                "--repository",
                str(clone_dir),
                "commit",
                "-u",
                "Owner User <owner@example.com>",
                "-m",
                "Denied push",
            ],
            check=True,
            env=_hg_env(),
            capture_output=True,
            text=True,
        )
        push = subprocess.run(
            [
                "hg",
                "--repository",
                str(clone_dir),
                "push",
                f"http://{owner_email}:{token}@{host}:{port}/acme/public-repo",
            ],
            env=_hg_env(),
            capture_output=True,
            text=True,
        )
        assert push.returncode != 0


def test_http_and_ssh_transport_parsers() -> None:
    assert classify_hg_http_command("cmd=capabilities") == TransportCommandKind.READ
    assert classify_hg_http_command("cmd=unbundle") == TransportCommandKind.WRITE

    request = parse_ssh_original_command("hg -R /acme/public-repo serve --stdio")
    assert request.organization_slug == "acme"
    assert request.repository_slug == "public-repo"
