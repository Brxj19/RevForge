from __future__ import annotations

import base64
import contextlib
import os
import shutil
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
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


def test_mounted_http_gateway_capabilities_request_succeeds(client, session_factory) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "public")

    from app.mercurial.storage_locator import RepositoryStorageLocator
    from app.models.repository import Repository

    repo = _run_query(
        session_factory,
        select(Repository).where(Repository.slug == "public-repo"),
    )
    assert repo is not None
    repo_path = RepositoryStorageLocator(get_settings()).repository_path(repo)
    assert repo_path.exists()
    _seed_repository(repo_path)

    response = client.get("/hg/acme/public-repo?cmd=capabilities")
    assert response.status_code == 200
    assert b"lookup" in response.content


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


def _hg_status(
    url: str, authorization: str | None = None, command: str = "capabilities"
) -> tuple[int, str | None, bytes]:
    request = urllib.request.Request(f"{url}?cmd={command}")
    if authorization is not None:
        request.add_header("Authorization", authorization)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.headers.get("WWW-Authenticate"), b""
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("WWW-Authenticate"), exc.read()


def _basic(email: str, token: str) -> str:
    return "Basic " + base64.b64encode(f"{email}:{token}".encode()).decode()


def test_http_gateway_clones_private_repository_with_token(
    client, session_factory, tmp_path
) -> None:
    """A stock hg client only sends credentials after a 401 challenge."""
    _register(client)
    _create_org_and_repo(client, "acme", "private")

    from app.mercurial.storage_locator import RepositoryStorageLocator
    from app.models.repository import Repository

    repo = _run_query(session_factory, select(Repository).where(Repository.slug == "public-repo"))
    assert repo is not None
    _seed_repository(RepositoryStorageLocator(get_settings()).repository_path(repo))

    token_create = client.post(
        "/api/v1/me/tokens",
        json={"name": "Read Token", "capability": "read"},
        headers=_csrf_headers(client),
    )
    assert token_create.status_code == 201
    token = token_create.json()["plaintext_token"]

    gateway = create_http_gateway_application(
        settings=get_settings(),
        session_factory_getter=lambda: session_factory,
    )
    with _serve_wsgi_app(gateway) as (host, port):
        hgrc = tmp_path / "auth.hgrc"
        hgrc.write_text(
            "[auth]\n"
            f"revforge.prefix = http://{host}:{port}/\n"
            "revforge.username = owner@example.com\n"
            f"revforge.password = {token}\n",
            encoding="utf-8",
        )
        clone_dir = tmp_path / "private-clone"
        clone = subprocess.run(
            ["hg", "clone", f"http://{host}:{port}/acme/public-repo", str(clone_dir)],
            env={**_hg_env(), "HGRCPATH": str(hgrc)},
            capture_output=True,
            text=True,
        )
        assert clone.returncode == 0, clone.stderr
        assert (clone_dir / "src" / "hello.py").is_file()


def test_http_gateway_challenges_anonymous_requests_without_revealing_repositories(
    client, session_factory
) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "private")
    _create_org_and_repo(client, "open", "public")

    gateway = create_http_gateway_application(
        settings=get_settings(),
        session_factory_getter=lambda: session_factory,
    )
    with _serve_wsgi_app(gateway) as (host, port):
        base = f"http://{host}:{port}"
        private = _hg_status(f"{base}/acme/public-repo")
        others = [
            _hg_status(f"{base}/acme/no-such-repo"),
            _hg_status(f"{base}/no-such-org/no-such-repo"),
            _hg_status(f"{base}/acme/-invalid-slug"),
            _hg_status(f"{base}/acme/public-repo", command="unbundle"),
            _hg_status(f"{base}/acme/no-such-repo", command="unbundle"),
            # A malformed Authorization header is treated as anonymous.
            _hg_status(f"{base}/acme/public-repo", authorization="Bearer not-basic"),
        ]
        public = _hg_status(f"{base}/open/public-repo")

    assert private[0] == 401
    assert private[1] == 'Basic realm="RevForge Mercurial"'
    # Anonymous callers must not be able to tell a private repository from a missing one.
    assert all(other == private for other in others), others
    # Public repositories stay readable without a credential prompt.
    assert public[:2] == (200, None)


def test_http_gateway_hides_private_repository_from_authenticated_outsider(
    client, session_factory
) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "private")
    client.post("/api/v1/auth/logout", headers=_csrf_headers(client))

    _register(client, email="outsider@example.com", display_name="Outsider")
    token_create = client.post(
        "/api/v1/me/tokens",
        json={"name": "Outsider Token", "capability": "read"},
        headers=_csrf_headers(client),
    )
    assert token_create.status_code == 201
    authorization = _basic("outsider@example.com", token_create.json()["plaintext_token"])

    gateway = create_http_gateway_application(
        settings=get_settings(),
        session_factory_getter=lambda: session_factory,
    )
    with _serve_wsgi_app(gateway) as (host, port):
        base = f"http://{host}:{port}"
        private = _hg_status(f"{base}/acme/public-repo", authorization)
        missing = _hg_status(f"{base}/acme/no-such-repo", authorization)

    assert private[0] == 404
    assert private[1] is None
    assert private == missing


def test_http_gateway_rejects_invalid_token_before_repository_lookup(
    client, session_factory
) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "private")
    authorization = _basic("owner@example.com", "not-a-real-token")

    gateway = create_http_gateway_application(
        settings=get_settings(),
        session_factory_getter=lambda: session_factory,
    )
    with _serve_wsgi_app(gateway) as (host, port):
        base = f"http://{host}:{port}"
        private = _hg_status(f"{base}/acme/public-repo", authorization)
        missing = _hg_status(f"{base}/acme/no-such-repo", authorization)

    assert private[0] == 401
    assert private == missing


def _make_stream_bundle(tmp_path: Path) -> bytes:
    """Build a bundle carrying a mandatory stream2 part (the C12 vector)."""
    source = tmp_path / "evil-src"
    subprocess.run(["hg", "init", str(source)], check=True, env=_hg_env())
    (source / "planted.txt").write_text("planted history\n", encoding="utf-8")
    _hg(source, "commit", "-u", "Attacker <a@x>", "-Am", "planted")
    bundle = tmp_path / "stream.hg"
    _hg(source, "bundle", "-a", "-t", "none-v2;stream=v2", str(bundle))
    return bundle.read_bytes()


def _post_hg(url: str, body: bytes, *, authorization: str | None, heads_hex: str = "666f726365"):
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/mercurial-0.1")
    request.add_header("X-HgArg-1", f"heads={heads_hex}")
    if authorization is not None:
        request.add_header("Authorization", authorization)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def _empty_private_repo_with_read_token(client, session_factory):
    _register(client)
    _create_org_and_repo(client, "acme", "private")
    token = client.post(
        "/api/v1/me/tokens",
        json={"name": "Read Token", "capability": "read"},
        headers=_csrf_headers(client),
    )
    assert token.status_code == 201
    return token.json()["plaintext_token"]


def _server_changeset_count(client, org: str = "acme", repo: str = "public-repo") -> int:
    response = client.get(f"/api/v1/organizations/{org}/repositories/{repo}/changesets")
    assert response.status_code == 200
    return len(response.json()["changesets"])


def test_dangerous_bundle2_parthandlers_removed() -> None:
    from mercurial import bundle2

    import app.mercurial.http_gateway  # noqa: F401  (import hardens the process)

    for part in (b"remote-changegroup", b"stream2", b"stream3-exp"):
        assert part not in bundle2.parthandlermapping, part
    # Normal push still works through the changegroup handler.
    assert b"changegroup" in bundle2.parthandlermapping


def test_read_token_cannot_stream_push_into_empty_repo(client, session_factory, tmp_path) -> None:
    token = _empty_private_repo_with_read_token(client, session_factory)
    bundle = _make_stream_bundle(tmp_path)
    gateway = create_http_gateway_application(
        settings=get_settings(), session_factory_getter=lambda: session_factory
    )
    with _serve_wsgi_app(gateway) as (host, port):
        base = f"http://{host}:{port}/acme/public-repo"
        auth = _basic("owner@example.com", token)
        # Direct unbundle, duplicate-cmd bypass, and batch-wrapped unbundle.
        # Direct unbundle (blocked by the write pre-check) and the duplicate-cmd
        # classification bypass (blocked because >1 cmd => write, and by deny_push).
        for url in (
            f"{base}?cmd=unbundle",
            f"{base}?cmd=capabilities&cmd=unbundle",
        ):
            status, _body = _post_hg(url, bundle, authorization=auth)
            assert status in (401, 403), (url, status)
    assert _server_changeset_count(client) == 0


def test_anonymous_cannot_stream_push_into_empty_repo(client, session_factory, tmp_path) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "public")
    bundle = _make_stream_bundle(tmp_path)
    gateway = create_http_gateway_application(
        settings=get_settings(), session_factory_getter=lambda: session_factory
    )
    with _serve_wsgi_app(gateway) as (host, port):
        base = f"http://{host}:{port}/acme/public-repo"
        for url in (f"{base}?cmd=unbundle", f"{base}?cmd=capabilities&cmd=unbundle"):
            status, _body = _post_hg(url, bundle, authorization=None)
            assert status in (401, 403), (url, status)
    assert _server_changeset_count(client) == 0


def test_stream_clone_serving_still_works(client, session_factory, tmp_path) -> None:
    """Removing the stream2 unbundle handler must not break serving stream clones."""
    _register(client)
    _create_org_and_repo(client, "acme", "public")
    from app.mercurial.storage_locator import RepositoryStorageLocator
    from app.models.repository import Repository

    repo = _run_query(session_factory, select(Repository).where(Repository.slug == "public-repo"))
    assert repo is not None

    _seed_repository(RepositoryStorageLocator(get_settings()).repository_path(repo))
    gateway = create_http_gateway_application(
        settings=get_settings(), session_factory_getter=lambda: session_factory
    )
    with _serve_wsgi_app(gateway) as (host, port):
        dest = tmp_path / "streamed"
        clone = subprocess.run(
            ["hg", "clone", "--stream", f"http://{host}:{port}/acme/public-repo", str(dest)],
            env=_hg_env(),
            capture_output=True,
            text=True,
        )
        assert clone.returncode == 0, clone.stderr
        assert (dest / "src" / "hello.py").is_file()


def test_deny_read_only_write_hook_blocks_read_sessions() -> None:
    """The deny hook guarding write on both transports (the only SSH gate)."""
    from mercurial import error as hgerror
    from mercurial import ui as uimod

    from app.mercurial.transport_hooks import deny_read_only_write

    read_ui = uimod.ui.load()
    read_ui.setconfig(b"revforge", b"transport_permission", b"read", b"revforge")
    try:
        deny_read_only_write(ui=read_ui, repo=None, hooktype=b"pretxnopen", txnname=b"push")
        raise AssertionError("read session should have been denied")
    except hgerror.Abort:
        pass

    write_ui = uimod.ui.load()
    write_ui.setconfig(b"revforge", b"transport_permission", b"write", b"revforge")
    # Write session: hook returns falsy (does not abort).
    assert not deny_read_only_write(ui=write_ui, repo=None, hooktype=b"pretxnopen", txnname=b"push")


def _small_limit_settings(monkeypatch, max_attempts: int):
    from app.core.config import get_settings

    monkeypatch.setenv("REVFORGE_TRANSPORT_RATE_LIMIT_MAX_ATTEMPTS", str(max_attempts))
    get_settings.cache_clear()
    return get_settings()


def test_successful_token_requests_are_not_rate_limited(
    client, session_factory, monkeypatch, tmp_path
) -> None:
    # C9: many successful authenticated reads must not trip the limiter.
    from app.mercurial.storage_locator import RepositoryStorageLocator
    from app.models.repository import Repository

    _register(client)
    _create_org_and_repo(client, "acme", "private")
    repo = _run_query(session_factory, select(Repository).where(Repository.slug == "public-repo"))
    _seed_repository(RepositoryStorageLocator(get_settings()).repository_path(repo))
    token = client.post(
        "/api/v1/me/tokens",
        json={"name": "Read Token", "capability": "read"},
        headers=_csrf_headers(client),
    ).json()["plaintext_token"]

    settings = _small_limit_settings(monkeypatch, 3)
    gateway = create_http_gateway_application(
        settings=settings, session_factory_getter=lambda: session_factory
    )
    auth = _basic("owner@example.com", token)
    with _serve_wsgi_app(gateway) as (host, port):
        url = f"http://{host}:{port}/acme/public-repo"
        for _ in range(6):  # well over max_attempts=3
            status, _hdr, _body = _hg_status(url, auth)
            assert status == 200, status


def test_repeated_bad_tokens_are_rate_limited_429(client, session_factory, monkeypatch) -> None:
    _register(client)
    _create_org_and_repo(client, "acme", "private")
    settings = _small_limit_settings(monkeypatch, 3)
    gateway = create_http_gateway_application(
        settings=settings, session_factory_getter=lambda: session_factory
    )
    bad = _basic("owner@example.com", "wrong-token")
    with _serve_wsgi_app(gateway) as (host, port):
        url = f"http://{host}:{port}/acme/public-repo"
        statuses = [_hg_status(url, bad)[0] for _ in range(6)]
    assert 429 in statuses, statuses


def test_valid_token_blocked_once_key_is_rate_limited(client, session_factory, monkeypatch) -> None:
    # Proves the limiter blocks BEFORE auth: once the (ip, username) key is
    # blocked by failures, even the correct token is refused with 429.
    _register(client)
    _create_org_and_repo(client, "acme", "public")
    token = client.post(
        "/api/v1/me/tokens",
        json={"name": "Read Token", "capability": "read"},
        headers=_csrf_headers(client),
    ).json()["plaintext_token"]

    settings = _small_limit_settings(monkeypatch, 3)
    gateway = create_http_gateway_application(
        settings=settings, session_factory_getter=lambda: session_factory
    )
    bad = _basic("owner@example.com", "wrong-token")
    good = _basic("owner@example.com", token)
    with _serve_wsgi_app(gateway) as (host, port):
        url = f"http://{host}:{port}/acme/public-repo"
        for _ in range(4):  # exhaust the failure budget (max=3)
            _hg_status(url, bad)
        blocked_status, _hdr, _body = _hg_status(url, good)
    assert blocked_status == 429, blocked_status
