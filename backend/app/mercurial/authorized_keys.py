from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from collections.abc import Iterable
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.ssh_public_key import SshPublicKey
from app.models.user import User

SSH_GATEWAY_MODULE = "app.mercurial.ssh_gateway"
SSH_KEY_COMMAND_TEMPLATE = 'command="python -m {module} {key_id}"'
SSH_KEY_COMMAND_OPTIONS = (
    "no-agent-forwarding",
    "no-port-forwarding",
    "no-pty",
    "no-user-rc",
    "no-X11-forwarding",
)


def render_authorized_keys_entry(key: SshPublicKey) -> str:
    command = SSH_KEY_COMMAND_TEMPLATE.format(module=SSH_GATEWAY_MODULE, key_id=key.id)
    options = ",".join((command, *SSH_KEY_COMMAND_OPTIONS))
    comment = f"revforge key_id={key.id} user_id={key.user_id}"
    return f"{options} {key.public_key_normalized} {comment}"


async def list_authorized_keys_entries(
    session: AsyncSession,
) -> list[str]:
    result = await session.execute(
        select(SshPublicKey)
        .options(selectinload(SshPublicKey.user))
        .join(User)
        .where(SshPublicKey.revoked_at.is_(None), User.is_active.is_(True))
        .order_by(SshPublicKey.created_at.asc(), SshPublicKey.id.asc())
    )
    return [render_authorized_keys_entry(key) for key in result.scalars()]


async def render_authorized_keys(
    session: AsyncSession,
) -> str:
    entries = await list_authorized_keys_entries(session)
    if not entries:
        return ""
    return "\n".join(entries) + "\n"


def write_authorized_keys_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        delete=False,
    ) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(content)
        temp_file.flush()
        os.fchmod(temp_file.fileno(), 0o600)
    os.replace(temp_path, path)


async def sync_authorized_keys(session: AsyncSession, *, output_path: Path) -> int:
    entries = await list_authorized_keys_entries(session)
    content = "\n".join(entries) + ("\n" if entries else "")
    write_authorized_keys_file(output_path, content)
    return len(entries)


async def sync_authorized_keys_from_session_factory(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    output_path: Path,
) -> int:
    async with session_factory() as session:
        return await sync_authorized_keys(session, output_path=output_path)


def main(argv: Iterable[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if len(args) > 1:
        raise SystemExit("Usage: python -m app.mercurial.authorized_keys [output-path]")
    settings = get_settings()
    output_path = Path(args[0] if args else settings.ssh_authorized_keys_path)
    count = asyncio.run(
        sync_authorized_keys_from_session_factory(
            SessionLocal,
            output_path=output_path,
        )
    )
    print(f"Wrote {count} SSH authorized keys to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
