from __future__ import annotations

import base64
import struct

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.ssh_public_key import SshPublicKey
from app.models.user import User
from app.services.errors import ConflictError
from app.services.transport_credentials import (
    create_ssh_public_key,
    revoke_ssh_public_key,
)


def _ed25519_key(seed: int = 1) -> str:
    raw = bytes([seed]) * 32
    blob = struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32) + raw
    return "ssh-ed25519 " + base64.b64encode(blob).decode()


@pytest_asyncio.fixture
async def factory(session_factory: async_sessionmaker[AsyncSession]) -> async_sessionmaker:
    return session_factory


async def _user(session: AsyncSession, email: str) -> User:
    user = User(email=email, display_name=email.split("@")[0], is_active=True)
    session.add(user)
    await session.flush()
    return user


@pytest.mark.asyncio
async def test_revoked_key_can_be_readded_by_same_user(factory) -> None:
    key_text = _ed25519_key()
    async with factory() as s:
        user = await _user(s, "a@example.com")
        created = await create_ssh_public_key(
            s, user=user, public_key=key_text, label="laptop", request_id=None
        )
        original_id = created.id
        await revoke_ssh_public_key(s, user=user, key_id=created.id, request_id=None)

    async with factory() as s:
        user = await s.scalar(select(User).where(User.email == "a@example.com"))
        reactivated = await create_ssh_public_key(
            s, user=user, public_key=key_text, label="laptop-again", request_id=None
        )
        assert reactivated.id == original_id  # same row reactivated, not a new one
        assert reactivated.revoked_at is None
        assert reactivated.label == "laptop-again"

    async with factory() as s:
        total = await s.scalar(select(func.count()).select_from(SshPublicKey))
        active = await s.scalar(
            select(func.count()).select_from(SshPublicKey).where(SshPublicKey.revoked_at.is_(None))
        )
    assert total == 1 and active == 1


@pytest.mark.asyncio
async def test_active_duplicate_key_still_conflicts(factory) -> None:
    key_text = _ed25519_key(seed=2)
    async with factory() as s:
        user = await _user(s, "a@example.com")
        await create_ssh_public_key(s, user=user, public_key=key_text, label="k", request_id=None)
        with pytest.raises(ConflictError):
            await create_ssh_public_key(
                s, user=user, public_key=key_text, label="dup", request_id=None
            )


@pytest.mark.asyncio
async def test_revoked_key_owned_by_other_user_conflicts(factory) -> None:
    key_text = _ed25519_key(seed=3)
    async with factory() as s:
        owner = await _user(s, "owner@example.com")
        created = await create_ssh_public_key(
            s, user=owner, public_key=key_text, label="k", request_id=None
        )
        await revoke_ssh_public_key(s, user=owner, key_id=created.id, request_id=None)
        other = await _user(s, "other@example.com")
        with pytest.raises(ConflictError):
            await create_ssh_public_key(
                s, user=other, public_key=key_text, label="steal", request_id=None
            )
