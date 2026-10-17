"""I36: provisioning survives crashes, cancellation, leftovers and concurrent requests."""

from __future__ import annotations

import asyncio
import os
import stat
import subprocess
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from repo_fixtures import (
    HG_EXECUTABLE,
    create_org,
    create_repo,
    hg_env,
    provision,
    register,
    repository_path,
    repository_record,
    update_repository,
    url,
)
from sqlalchemy import select

from app.api.deps import get_hg_command_runner
from app.core.config import get_settings
from app.core.security import utc_now
from app.domain.enums import RepositoryProvisioningState
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.errors import HgCommandFailedError, ProvisioningInProgressError
from app.mercurial.provisioning_service import provision_repository, sweep_stale_provisioning
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.audit_event import AuditEvent
from app.models.repository import Repository
from app.models.user import User

OWNER = "owner@example.com"
ORG = "acme"


def _setup(client: Any, slug: str = "repo") -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, slug, "public")


def _audit_types(session_factory: Any, slug: str) -> list[str]:
    repository = repository_record(session_factory, slug)

    async def runner() -> list[str]:
        async with session_factory() as session:
            rows = await session.scalars(
                select(AuditEvent)
                .where(AuditEvent.repository_id == repository.id)
                .order_by(AuditEvent.created_at.asc())
            )
            return [row.event_type for row in rows]

    return asyncio.run(runner())


def _verify(path: Path) -> None:
    subprocess.run(
        [HG_EXECUTABLE, "--repository", str(path), "verify", "-q"],
        check=True,
        env=hg_env(),
        capture_output=True,
        cwd=path,
    )


def _no_staging_left(path: Path) -> bool:
    return not any(entry.name.startswith(".provisioning-") for entry in path.parent.iterdir())


def test_stale_provisioning_row_is_reclaimed_and_verified(
    client: Any, session_factory: Any
) -> None:
    _setup(client)
    update_repository(
        session_factory,
        "repo",
        provisioning_state="provisioning",
        provisioning_started_at=utc_now() - timedelta(hours=1),
        provisioning_attempt_id=uuid4(),
    )
    response = provision(client, ORG, "repo")
    assert response.status_code == 200, response.text
    assert response.json()["provisioning_state"] == "ready"
    path = repository_path(session_factory, "repo")
    _verify(path)
    assert _no_staging_left(path)
    record = repository_record(session_factory, "repo")
    assert record.provisioning_started_at is None
    events = _audit_types(session_factory, "repo")
    assert "repository.provision_reclaimed" in events
    assert events[-1] == "repository.provisioned"


def test_legacy_stuck_row_without_start_time_is_reclaimed(
    client: Any, session_factory: Any
) -> None:
    _setup(client)
    update_repository(session_factory, "repo", provisioning_state="provisioning")
    assert provision(client, ORG, "repo").status_code == 200


def test_live_provisioning_is_not_reclaimed(client: Any, session_factory: Any) -> None:
    _setup(client)
    update_repository(
        session_factory,
        "repo",
        provisioning_state="provisioning",
        provisioning_started_at=utc_now(),
        provisioning_attempt_id=uuid4(),
    )
    response = provision(client, ORG, "repo")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "provisioning_in_progress"


def test_leftover_empty_hg_repository_is_recovered(client: Any, session_factory: Any) -> None:
    _setup(client)
    path = RepositoryStorageLocator(get_settings()).prepare_repository_parent(
        repository_record(session_factory, "repo")
    )
    subprocess.run(
        [HG_EXECUTABLE, "init", str(path)], check=True, env=hg_env(), capture_output=True
    )
    response = provision(client, ORG, "repo")
    assert response.status_code == 200, response.text
    _verify(path)


def test_leftover_empty_directory_is_recovered(client: Any, session_factory: Any) -> None:
    _setup(client)
    path = RepositoryStorageLocator(get_settings()).prepare_repository_parent(
        repository_record(session_factory, "repo")
    )
    path.mkdir()
    assert provision(client, ORG, "repo").status_code == 200
    _verify(path)


def test_non_empty_leftover_is_a_storage_conflict_and_never_deleted(
    client: Any, session_factory: Any
) -> None:
    _setup(client)
    path = RepositoryStorageLocator(get_settings()).prepare_repository_parent(
        repository_record(session_factory, "repo")
    )
    subprocess.run(
        [HG_EXECUTABLE, "init", str(path)], check=True, env=hg_env(), capture_output=True
    )
    (path / "keep.txt").write_text("precious\n", encoding="utf-8")
    subprocess.run(
        [HG_EXECUTABLE, "--repository", str(path), "commit", "-A", "-q", "-u", "a", "-m", "x"],
        check=True,
        env=hg_env(),
        capture_output=True,
        cwd=path,
    )
    response = provision(client, ORG, "repo")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "storage_conflict"
    assert str(path) not in response.text
    assert (path / "keep.txt").read_text(encoding="utf-8") == "precious\n"
    _verify(path)
    detail = client.get(url(ORG, "repo")).json()
    assert detail["provisioning_state"] == "failed"
    assert detail["provisioning_error"] == "storage_conflict"
    assert _no_staging_left(path)


class _FailingRunner(HgCommandRunner):
    def __init__(self, settings: Any, *, fail_on: str) -> None:
        super().__init__(settings)
        self._fail_on = fail_on

    async def run(self, args: Any, **kwargs: Any) -> Any:
        if args and args[0] == self._fail_on:
            # stderr-like text with a host path must never reach the API or the database.
            raise HgCommandFailedError(code="abort: /srv/repos/secret: permission denied")
        return await super().run(args, **kwargs)


@pytest.mark.parametrize(
    ("fail_on", "expected"), [("init", "hg_init_failed"), ("verify", "hg_verify_failed")]
)
def test_hg_failures_map_to_enum_codes_without_leaking(
    client: Any, session_factory: Any, fail_on: str, expected: str
) -> None:
    _setup(client)
    client.app.dependency_overrides[get_hg_command_runner] = lambda: _FailingRunner(
        get_settings(), fail_on=fail_on
    )
    try:
        response = provision(client, ORG, "repo")
    finally:
        client.app.dependency_overrides.pop(get_hg_command_runner, None)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == expected
    assert "/srv/repos" not in response.text
    record = repository_record(session_factory, "repo")
    assert record.provisioning_state == RepositoryProvisioningState.FAILED
    assert record.provisioning_error_code == expected
    path = repository_path(session_factory, "repo")
    assert not path.exists()
    assert _no_staging_left(path)
    detail = client.get(url(ORG, "repo")).json()
    assert detail["provisioning_error"] == expected
    assert "/srv/repos" not in str(detail)
    # A failed attempt can be retried.
    assert provision(client, ORG, "repo").status_code == 200


def _service_context(session_factory: Any) -> tuple[Repository, User]:
    async def runner() -> tuple[Repository, User]:
        async with session_factory() as session:
            repository = await session.scalar(select(Repository).where(Repository.slug == "repo"))
            user = await session.scalar(select(User).where(User.email == OWNER))
            assert repository is not None and user is not None
            return repository, user

    return asyncio.run(runner())


class _BlockingRunner(HgCommandRunner):
    """Runs `hg init` for real, then blocks before `hg verify` until released."""

    def __init__(self, settings: Any) -> None:
        super().__init__(settings)
        self.reached_verify = asyncio.Event()
        self.release = asyncio.Event()

    async def run(self, args: Any, **kwargs: Any) -> Any:
        if args and args[0] == "verify":
            self.reached_verify.set()
            await self.release.wait()
        return await super().run(args, **kwargs)


def test_concurrent_provision_requests_create_one_repository(
    client: Any, session_factory: Any
) -> None:
    _setup(client)
    repository, actor = _service_context(session_factory)
    locator = RepositoryStorageLocator(get_settings())

    async def scenario() -> None:
        runner = _BlockingRunner(get_settings())
        async with session_factory() as first, session_factory() as second:
            task = asyncio.create_task(
                provision_repository(
                    first,
                    repository_id=repository.id,
                    actor=actor,
                    request_id="r1",
                    storage_locator=locator,
                    command_runner=runner,
                )
            )
            await asyncio.wait_for(runner.reached_verify.wait(), timeout=10)
            with pytest.raises(ProvisioningInProgressError):
                await provision_repository(
                    second,
                    repository_id=repository.id,
                    actor=actor,
                    request_id="r2",
                    storage_locator=locator,
                    command_runner=HgCommandRunner(get_settings()),
                )
            runner.release.set()
            result = await task
            assert result.provisioning_state == RepositoryProvisioningState.READY

    asyncio.run(scenario())
    path = repository_path(session_factory, "repo")
    _verify(path)
    assert [entry.name for entry in path.parent.iterdir()] == [path.name]
    assert _audit_types(session_factory, "repo").count("repository.provisioned") == 1


def test_cancelled_provisioning_marks_failed_and_removes_staging(
    client: Any, session_factory: Any
) -> None:
    _setup(client)
    repository, actor = _service_context(session_factory)
    locator = RepositoryStorageLocator(get_settings())

    async def scenario() -> None:
        runner = _BlockingRunner(get_settings())
        async with session_factory() as session:
            task = asyncio.create_task(
                provision_repository(
                    session,
                    repository_id=repository.id,
                    actor=actor,
                    request_id="r1",
                    storage_locator=locator,
                    command_runner=runner,
                )
            )
            await asyncio.wait_for(runner.reached_verify.wait(), timeout=10)
            # The staging repository exists while the attempt is in flight.
            parent = locator.repository_path(repository).parent
            assert any(entry.name.startswith(".provisioning-") for entry in parent.iterdir())
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    asyncio.run(scenario())
    record = repository_record(session_factory, "repo")
    assert record.provisioning_state == RepositoryProvisioningState.FAILED
    assert record.provisioning_error_code == "cancelled"
    path = repository_path(session_factory, "repo")
    assert not path.exists()
    assert _no_staging_left(path)
    assert "repository.provision_failed" in _audit_types(session_factory, "repo")
    # And the repository can be provisioned again afterwards.
    assert provision(client, ORG, "repo").status_code == 200


def test_sweeper_fails_stale_rows_only(client: Any, session_factory: Any) -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "stale", "public")
    create_repo(client, ORG, "live", "public")
    attempt = uuid4()
    update_repository(
        session_factory,
        "stale",
        provisioning_state="provisioning",
        provisioning_started_at=utc_now() - timedelta(minutes=30),
        provisioning_attempt_id=attempt,
    )
    update_repository(
        session_factory,
        "live",
        provisioning_state="provisioning",
        provisioning_started_at=utc_now(),
        provisioning_attempt_id=uuid4(),
    )

    async def sweep() -> int:
        async with session_factory() as session:
            return await sweep_stale_provisioning(session, stale_after_seconds=300)

    assert asyncio.run(sweep()) == 1
    stale = repository_record(session_factory, "stale")
    assert stale.provisioning_state == RepositoryProvisioningState.FAILED
    assert stale.provisioning_error_code == "provisioning_stale"
    assert stale.provisioning_attempt_id == attempt
    assert repository_record(session_factory, "live").provisioning_state == (
        RepositoryProvisioningState.PROVISIONING
    )
    assert "repository.provision_stale" in _audit_types(session_factory, "stale")
    assert client.get(url(ORG, "stale")).json()["provisioning_error"] == "provisioning_stale"
    assert asyncio.run(sweep()) == 0


def test_runner_kills_child_process_on_cancellation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, settings_env: None
) -> None:
    pid_file = tmp_path / "hg.pid"
    fake_hg = tmp_path / "slow-hg"
    fake_hg.write_text(f"#!/bin/sh\necho $$ > {pid_file}\nexec sleep 30\n", encoding="utf-8")
    fake_hg.chmod(fake_hg.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setenv("REVFORGE_HG_EXECUTABLE", str(fake_hg))
    get_settings.cache_clear()
    runner = HgCommandRunner(get_settings())

    async def scenario() -> int:
        task = asyncio.create_task(runner.run(["log"], cwd=tmp_path))
        for _ in range(200):
            if pid_file.exists() and pid_file.read_text(encoding="utf-8").strip():
                break
            await asyncio.sleep(0.02)
        pid = int(pid_file.read_text(encoding="utf-8").strip())
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        return pid

    pid = asyncio.run(scenario())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_relative_hg_executable_is_rejected(
    monkeypatch: pytest.MonkeyPatch, settings_env: None
) -> None:
    monkeypatch.setenv("REVFORGE_HG_EXECUTABLE", "bin/hg")
    get_settings.cache_clear()
    with pytest.raises(FileNotFoundError):
        HgCommandRunner(get_settings())
