from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.enums import RepositoryVisibility
from app.models.organization import Organization
from app.models.repository import Repository
from app.models.repository_event import RepositoryEvent
from app.models.user import User
from app.services.event_spool import FileEventSpoolReader


@pytest_asyncio.fixture
async def factory(session_factory: async_sessionmaker[AsyncSession]) -> async_sessionmaker:
    return session_factory


async def _make_repo(factory: async_sessionmaker) -> str:
    async with factory() as s:
        org = Organization(slug="rev", display_name="Rev")
        s.add(org)
        await s.flush()
        user = User(email="u@example.com", display_name="u", is_active=True)
        s.add(user)
        await s.flush()
        repo = Repository(
            organization_id=org.id,
            slug="proj",
            display_name="P",
            visibility=RepositoryVisibility.PRIVATE,
            created_by_user_id=user.id,
        )
        s.add(repo)
        await s.flush()
        repo_id = str(repo.id)
        await s.commit()
    return repo_id


def _write_event(spool: Path, repo_id: str, *, request_id: str = "") -> Path:
    path = spool / f"{uuid4().hex}.json"
    path.write_text(
        json.dumps(
            {
                "event_type": "repository.push.accepted",
                "repository_id": repo_id,
                "actor_user_id": None,
                "authentication_method": "ssh_key",
                "credential_id": None,
                "source_ip": None,
                "request_id": request_id,
                "pushed_nodes": ["a" * 40],
            }
        ),
        encoding="utf-8",
    )
    return path


async def _count_events(factory) -> int:
    async with factory() as s:
        return await s.scalar(select(func.count()).select_from(RepositoryEvent)) or 0


@pytest.mark.asyncio
async def test_two_empty_request_id_events_both_import(factory, tmp_path) -> None:
    repo_id = await _make_repo(factory)
    spool = tmp_path / "spool"
    spool.mkdir()
    p1 = _write_event(spool, repo_id, request_id="")
    p2 = _write_event(spool, repo_id, request_id="")
    reader = FileEventSpoolReader(str(spool))
    async with factory() as s:
        imported = await reader.import_to_db(s)
    assert imported == 2
    assert await _count_events(factory) == 2
    assert not p1.exists() and not p2.exists()  # consumed after commit


@pytest.mark.asyncio
async def test_missing_repo_event_does_not_block_others(factory, tmp_path) -> None:
    repo_id = await _make_repo(factory)
    spool = tmp_path / "spool"
    spool.mkdir()
    bad = _write_event(spool, str(uuid4()), request_id="")  # repo does not exist
    good = _write_event(spool, repo_id, request_id="")
    reader = FileEventSpoolReader(str(spool))
    async with factory() as s:
        imported = await reader.import_to_db(s)
    assert imported == 1
    assert await _count_events(factory) == 1
    assert not good.exists()  # imported -> removed
    assert not bad.exists()  # obsolete -> dropped, not left to block the spool


@pytest.mark.asyncio
async def test_corrupt_file_is_dropped_without_blocking(factory, tmp_path) -> None:
    repo_id = await _make_repo(factory)
    spool = tmp_path / "spool"
    spool.mkdir()
    corrupt = spool / "bad.json"
    corrupt.write_text("{not json", encoding="utf-8")
    good = _write_event(spool, repo_id)
    reader = FileEventSpoolReader(str(spool))
    async with factory() as s:
        imported = await reader.import_to_db(s)
    assert imported == 1
    assert not corrupt.exists() and not good.exists()


@pytest.mark.asyncio
async def test_same_idempotency_key_not_double_imported(factory, tmp_path) -> None:
    # Simulates a crash after commit but before the file was unlinked: the same
    # file (same filename -> same key) is processed again and must not duplicate.
    repo_id = await _make_repo(factory)
    reader = FileEventSpoolReader(str(tmp_path))
    data = {
        "event_type": "repository.push.accepted",
        "repository_id": repo_id,
        "request_id": "",
        "pushed_nodes": ["a" * 40],
    }
    async with factory() as s:
        first = await reader._import_one(s, data, idempotency_key="file:dup.json")
        second = await reader._import_one(s, data, idempotency_key="file:dup.json")
    assert first == "imported"
    assert second == "dropped"
    assert await _count_events(factory) == 1


@pytest.mark.asyncio
async def test_malformed_event_is_dropped_not_retried(factory, tmp_path) -> None:
    repo_id = await _make_repo(factory)
    spool = tmp_path / "spool"
    spool.mkdir()
    path = spool / f"{uuid4().hex}.json"
    path.write_text(
        json.dumps(
            {
                "event_type": "repository.push.accepted",
                "repository_id": repo_id,
                "actor_user_id": "not-a-uuid",  # permanent parse error
                "request_id": "",
                "pushed_nodes": [],
            }
        ),
        encoding="utf-8",
    )
    reader = FileEventSpoolReader(str(spool))
    async with factory() as s:
        imported = await reader.import_to_db(s)
    assert imported == 0
    assert not path.exists()  # dropped, not left to retry forever
    assert await _count_events(factory) == 0
