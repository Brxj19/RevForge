"""I38: one pinned Mercurial for CLI and library; bounded hg concurrency."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.mercurial import version_check
from app.mercurial.command_runner import resolve_hg_executable
from app.mercurial.errors import HgBusyError
from app.mercurial.work_limiter import HgWorkLimiter


def test_cli_and_library_versions_match(settings_env: None) -> None:
    version = asyncio.run(version_check.ensure_mercurial_versions_match(get_settings()))
    assert version == version_check.library_version()
    assert version.startswith("7.2.")


def test_bare_hg_resolves_next_to_the_interpreter() -> None:
    sibling = Path(sys.executable).parent / "hg"
    assert sibling.is_file()
    assert resolve_hg_executable("hg") == str(sibling)


def test_version_mismatch_refuses_to_start(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(version_check, "library_version", lambda: "7.1.9")
    with pytest.raises(version_check.MercurialVersionMismatchError):
        asyncio.run(version_check.ensure_mercurial_versions_match(get_settings()))


def test_unsupported_series_refuses_to_start(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_cli(settings: object) -> str:
        return "7.3.0"

    monkeypatch.setattr(version_check, "library_version", lambda: "7.3.0")
    monkeypatch.setattr(version_check, "cli_version", fake_cli)
    with pytest.raises(version_check.MercurialVersionMismatchError):
        asyncio.run(version_check.ensure_mercurial_versions_match(get_settings()))


def test_api_lifespan_runs_the_version_check(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    from fastapi.testclient import TestClient

    from app.main import create_application

    monkeypatch.setattr(version_check, "library_version", lambda: "6.9.0")
    with pytest.raises(version_check.MercurialVersionMismatchError):
        with TestClient(create_application()):
            pass


def test_work_limiter_bounds_per_repository_concurrency() -> None:
    limiter = HgWorkLimiter(max_global=4, max_per_repository=1, acquire_timeout=0.2)

    async def scenario() -> None:
        entered = asyncio.Event()
        release = asyncio.Event()

        async def hold() -> None:
            async with limiter.slot("repo-a"):
                entered.set()
                await release.wait()

        holder = asyncio.create_task(hold())
        await entered.wait()
        # Same repository: no slot within the timeout -> busy.
        with pytest.raises(HgBusyError):
            async with limiter.slot("repo-a"):
                pass
        # Another repository is unaffected.
        async with limiter.slot("repo-b"):
            pass
        release.set()
        await holder
        assert limiter.in_use("repo-a") == 0

    asyncio.run(scenario())


def test_work_limiter_bounds_global_concurrency() -> None:
    limiter = HgWorkLimiter(max_global=1, max_per_repository=4, acquire_timeout=0.2)

    async def scenario() -> None:
        entered = asyncio.Event()
        release = asyncio.Event()

        async def hold() -> None:
            async with limiter.slot("repo-a"):
                entered.set()
                await release.wait()

        holder = asyncio.create_task(hold())
        await entered.wait()
        with pytest.raises(HgBusyError):
            async with limiter.slot("repo-b"):
                pass
        release.set()
        await holder

    asyncio.run(scenario())
