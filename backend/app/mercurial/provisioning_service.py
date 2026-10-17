"""Repository provisioning (``hg init``) with crash/cancel recovery (I36).

Flow for one attempt:

1. Under a row lock: refuse READY/archived; refuse a live PROVISIONING attempt; reclaim a
   stale one (audit ``repository.provision_reclaimed``). Record a new attempt id + start
   time and commit, so the long-running hg work holds no database lock.
2. Remove only a *recoverable* leftover at the final path (empty directory, or a ``.hg``
   with no changesets). Anything else is ``storage_conflict``: never rmtree real history.
3. ``hg init`` into a staging directory beside the final path, ``hg verify -q`` it, then
   ``os.rename`` it into place (atomic on one filesystem).
4. Compare-and-set the final state on the attempt id, so a superseded attempt cannot
   overwrite a newer one.

Any failure, including ``asyncio.CancelledError``, removes the staging directory and marks
the attempt FAILED under ``asyncio.shield``. ``provisioning_error_code`` only ever holds a
code from ``PROVISIONING_ERROR_CODES``: never stderr, paths or exception text.
"""

from __future__ import annotations

import asyncio
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import get_args
from uuid import UUID, uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ensure_utc, utc_now
from app.domain.enums import (
    ProvisioningErrorCode,
    RepositoryProvisioningState,
)
from app.models.repository import Repository
from app.models.user import User
from app.services.audit import record_audit_event

from .command_runner import HgCommandRunner
from .errors import (
    ProvisioningFailedError,
    ProvisioningInProgressError,
    RepositoryStorageError,
)
from .storage_locator import RepositoryStorageLocator

DEFAULT_STALE_AFTER_SECONDS = 300
_STAGING_PREFIX = ".provisioning-"


class _StorageConflictError(Exception):
    """The final repository path holds something that must not be deleted."""


def public_provisioning_error(repository: Repository) -> ProvisioningErrorCode | None:
    """The enum code exposed by ``GET R``; legacy free-form codes are coarsened."""
    if repository.provisioning_state != RepositoryProvisioningState.FAILED:
        return None
    code = repository.provisioning_error_code
    for known in get_args(ProvisioningErrorCode):
        if code == known:
            return known  # type: ignore[no-any-return]
    if code is not None and code.startswith("hg_"):
        return "hg_init_failed"
    return "storage_error"


def is_stale(repository: Repository, *, now: datetime, stale_after_seconds: int) -> bool:
    started_at = repository.provisioning_started_at
    if started_at is None:
        # Rows stuck in PROVISIONING before attempt tracking existed.
        return True
    return ensure_utc(started_at) <= now - timedelta(seconds=stale_after_seconds)


async def provision_repository(
    session: AsyncSession,
    *,
    repository_id: UUID,
    actor: User,
    request_id: str | None,
    storage_locator: RepositoryStorageLocator,
    command_runner: HgCommandRunner,
    stale_after_seconds: int = DEFAULT_STALE_AFTER_SECONDS,
) -> Repository:
    repository = await session.scalar(
        select(Repository).where(Repository.id == repository_id).with_for_update()
    )
    if repository is None:
        raise ProvisioningFailedError("repository_missing")
    if repository.archived_at is not None:
        raise ProvisioningFailedError("repository_archived")
    if repository.provisioning_state == RepositoryProvisioningState.READY:
        return repository

    now = utc_now()
    if repository.provisioning_state == RepositoryProvisioningState.PROVISIONING:
        if not is_stale(repository, now=now, stale_after_seconds=stale_after_seconds):
            raise ProvisioningInProgressError()
        await record_audit_event(
            session,
            event_type="repository.provision_reclaimed",
            actor_user_id=actor.id,
            organization_id=repository.organization_id,
            repository_id=repository.id,
            request_id=request_id,
            metadata_json={
                "previous_attempt_id": (
                    str(repository.provisioning_attempt_id)
                    if repository.provisioning_attempt_id is not None
                    else None
                ),
                "reason": "stale",
            },
        )

    attempt_id = uuid4()
    repository.provisioning_state = RepositoryProvisioningState.PROVISIONING
    repository.provisioning_error_code = None
    repository.provisioning_started_at = now
    repository.provisioning_attempt_id = attempt_id
    await record_audit_event(
        session,
        event_type="repository.provision_requested",
        actor_user_id=actor.id,
        organization_id=repository.organization_id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={"attempt_id": str(attempt_id)},
    )
    await session.commit()

    staging_path: Path | None = None
    step_code = "storage_error"
    try:
        final_path = storage_locator.prepare_repository_parent(repository)
        _remove_recoverable_leftover(final_path)
        staging_path = final_path.parent / f"{_STAGING_PREFIX}{repository.id}-{attempt_id.hex}"
        step_code = "hg_init_failed"
        await command_runner.run(["init", str(staging_path)], cwd=final_path.parent)
        step_code = "hg_verify_failed"
        await command_runner.run(["verify", "-q"], repository_path=staging_path)
        step_code = "storage_error"
        os.rename(staging_path, final_path)
        staging_path = None
    except BaseException as exc:
        error_code = _classify_failure(exc, step_code)
        if staging_path is not None:
            shutil.rmtree(staging_path, ignore_errors=True)
        await asyncio.shield(
            _mark_failed(
                session,
                repository_id=repository_id,
                attempt_id=attempt_id,
                actor=actor,
                request_id=request_id,
                error_code=error_code,
            )
        )
        if isinstance(exc, Exception):
            raise ProvisioningFailedError(error_code) from exc
        raise

    completed = await session.execute(
        update(Repository)
        .where(
            Repository.id == repository_id,
            Repository.provisioning_attempt_id == attempt_id,
        )
        .values(
            provisioning_state=RepositoryProvisioningState.READY,
            provisioned_at=utc_now(),
            provisioning_error_code=None,
            provisioning_started_at=None,
        )
        .execution_options(synchronize_session=False)
    )
    if _rowcount(completed) != 1:
        # A newer attempt reclaimed this one. Its leftover check adopts or rebuilds the
        # (empty) repository we just created, so report "in progress" instead of failing.
        await session.rollback()
        raise ProvisioningInProgressError()
    await record_audit_event(
        session,
        event_type="repository.provisioned",
        actor_user_id=actor.id,
        organization_id=repository.organization_id,
        repository_id=repository_id,
        request_id=request_id,
        metadata_json={"attempt_id": str(attempt_id)},
    )
    await session.commit()
    reloaded = await session.get(Repository, repository_id, populate_existing=True)
    if reloaded is None:
        raise ProvisioningFailedError("repository_not_found_after_provision")
    return reloaded


async def sweep_stale_provisioning(
    session: AsyncSession, *, stale_after_seconds: int, now: datetime | None = None
) -> int:
    """Flip PROVISIONING rows whose attempt went stale to FAILED (``provisioning_stale``).

    The attempt id is kept, so if the original attempt does finish later its
    compare-and-set can still mark the repository READY.
    """
    current = now or utc_now()
    cutoff = current - timedelta(seconds=stale_after_seconds)
    rows = await session.scalars(
        select(Repository)
        .where(
            Repository.provisioning_state == RepositoryProvisioningState.PROVISIONING,
            or_(
                Repository.provisioning_started_at.is_(None),
                Repository.provisioning_started_at <= cutoff,
            ),
        )
        .with_for_update(skip_locked=True)
    )
    swept = 0
    for repository in rows:
        repository.provisioning_state = RepositoryProvisioningState.FAILED
        repository.provisioning_error_code = "provisioning_stale"
        repository.provisioning_started_at = None
        repository.provisioned_at = None
        await record_audit_event(
            session,
            event_type="repository.provision_stale",
            actor_user_id=None,
            organization_id=repository.organization_id,
            repository_id=repository.id,
            metadata_json={
                "attempt_id": (
                    str(repository.provisioning_attempt_id)
                    if repository.provisioning_attempt_id is not None
                    else None
                ),
            },
        )
        swept += 1
    await session.commit()
    return swept


def _classify_failure(exc: BaseException, step_code: str) -> str:
    if isinstance(exc, asyncio.CancelledError):
        return "cancelled"
    if isinstance(exc, _StorageConflictError):
        return "storage_conflict"
    if isinstance(exc, RepositoryStorageError | OSError):
        return "storage_error"
    return step_code


def _remove_recoverable_leftover(final_path: Path) -> None:
    """Clear an empty directory or an empty ``hg init`` at the final path; refuse the rest."""
    if not final_path.exists() and not final_path.is_symlink():
        return
    if final_path.is_symlink() or not final_path.is_dir():
        raise _StorageConflictError()
    entries = list(final_path.iterdir())
    if not entries:
        final_path.rmdir()
        return
    if [entry.name for entry in entries] == [".hg"] and _hg_dir_has_no_history(entries[0]):
        shutil.rmtree(final_path)
        return
    raise _StorageConflictError()


def _hg_dir_has_no_history(hg_dir: Path) -> bool:
    if hg_dir.is_symlink() or not hg_dir.is_dir():
        return False
    store = hg_dir / "store"
    if store.is_symlink():
        return False
    if not store.exists():
        return True  # interrupted before the store was written
    for name in ("00changelog.i", "00changelog.d", "00changelog.n"):
        candidate = store / name
        if candidate.exists() and (candidate.is_symlink() or candidate.stat().st_size > 0):
            return False
    for subdirectory in ("data", "meta"):
        candidate = store / subdirectory
        if candidate.exists() and (candidate.is_symlink() or any(candidate.iterdir())):
            return False
    return True


async def _mark_failed(
    session: AsyncSession,
    *,
    repository_id: UUID,
    attempt_id: UUID,
    actor: User,
    request_id: str | None,
    error_code: str,
) -> None:
    await session.rollback()
    result = await session.execute(
        update(Repository)
        .where(
            Repository.id == repository_id,
            Repository.provisioning_attempt_id == attempt_id,
        )
        .values(
            provisioning_state=RepositoryProvisioningState.FAILED,
            provisioned_at=None,
            provisioning_error_code=error_code,
            provisioning_started_at=None,
        )
        .execution_options(synchronize_session=False)
    )
    if _rowcount(result) == 1:
        repository = await session.get(Repository, repository_id, populate_existing=True)
        await record_audit_event(
            session,
            event_type="repository.provision_failed",
            actor_user_id=actor.id,
            organization_id=repository.organization_id if repository is not None else None,
            repository_id=repository_id,
            request_id=request_id,
            metadata_json={"error_code": error_code, "attempt_id": str(attempt_id)},
        )
    await session.commit()


def _rowcount(result: object) -> int:
    return int(getattr(result, "rowcount", 0) or 0)
