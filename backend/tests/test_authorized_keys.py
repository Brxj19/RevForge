from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.mercurial.authorized_keys import render_authorized_keys, write_authorized_keys_file
from app.models.ssh_public_key import SshPublicKey


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, "Origin": "http://localhost:5173"}


def _register(client) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "display_name": "Owner User",
            "password": "StrongPassword123",
        },
    )
    assert response.status_code == 201


def _create_ssh_key(client) -> dict[str, str]:
    key_dir = Path(tempfile.mkdtemp(prefix="revforge-authorized-keys-"))
    try:
        key_path = key_dir / "id_ed25519"
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-N", "", "-f", str(key_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        public_key = key_path.with_suffix(".pub").read_text(encoding="utf-8").strip()
        response = client.post(
            "/api/v1/me/ssh-keys",
            json={"label": "Laptop", "public_key": public_key},
            headers=_csrf_headers(client),
        )
        assert response.status_code == 201
        return response.json()
    finally:
        import shutil

        shutil.rmtree(key_dir, ignore_errors=True)


def _run_query(session_factory: async_sessionmaker[AsyncSession], statement):
    async def runner():
        async with session_factory() as session:
            return await session.scalar(statement)

    import asyncio

    return asyncio.run(runner())


def test_authorized_keys_render_and_sync(client, session_factory, tmp_path) -> None:
    _register(client)
    key = _create_ssh_key(client)
    created_key = _run_query(
        session_factory,
        select(SshPublicKey).where(SshPublicKey.id == UUID(key["id"])),
    )
    assert created_key is not None

    async def render() -> str:
        async with session_factory() as session:
            return await render_authorized_keys(session)

    import asyncio

    content = asyncio.run(render())
    expected_command = f'command="python -m app.mercurial.ssh_gateway {created_key.id}"'
    assert expected_command in content
    assert "no-agent-forwarding" in content
    assert "no-port-forwarding" in content
    assert "no-pty" in content
    assert "no-user-rc" in content
    assert "no-X11-forwarding" in content
    assert f"revforge key_id={created_key.id} user_id={created_key.user_id}" in content
    assert created_key.public_key_normalized in content

    output_path = tmp_path / "authorized_keys"
    write_authorized_keys_file(output_path, content)
    assert output_path.read_text(encoding="utf-8") == content

    revoke_response = client.delete(
        f"/api/v1/me/ssh-keys/{created_key.id}",
        headers=_csrf_headers(client),
    )
    assert revoke_response.status_code == 204

    async def render_after_revoke() -> str:
        async with session_factory() as session:
            return await render_authorized_keys(session)

    content_after_revoke = asyncio.run(render_after_revoke())
    assert created_key.public_key_normalized not in content_after_revoke
