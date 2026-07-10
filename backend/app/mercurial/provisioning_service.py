from __future__ import annotations

import shutil

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import utc_now
from app.domain.enums import RepositoryProvisioningState
from app.models.repository import Repository
from app.models.user import User
from app.services.audit import record_audit_event

from .command_runner import HgCommandRunner
from .errors import (
    HgCommandFailedError,
    HgCommandOutputLimitError,
    HgCommandTimeoutError,
    ProvisioningFailedError,
    ProvisioningInProgressError,
)
from .storage_locator import RepositoryStorageLocator


def safe_provisioning_error_code(exc: Exception) -> str:
    if isinstance(exc, HgCommandTimeoutError):
        return "hg_timeout"
    if isinstance(exc, HgCommandOutputLimitError):
        return "hg_output_limit"
    if isinstance(exc, HgCommandFailedError):
        return exc.code
    return "provisioning_failed"


async def provision_repository(
    session: AsyncSession,
    *,
    repository_id,
    actor: User,
    request_id: str | None,
    storage_locator: RepositoryStorageLocator,
    command_runner: HgCommandRunner,
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
    if repository.provisioning_state == RepositoryProvisioningState.PROVISIONING:
        raise ProvisioningInProgressError()

    repository.provisioning_state = RepositoryProvisioningState.PROVISIONING
    repository.provisioning_error_code = None
    await record_audit_event(
        session,
        event_type="repository.provision_requested",
        actor_user_id=actor.id,
        organization_id=repository.organization_id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={},
    )
    await session.commit()

    repository_path = storage_locator.prepare_repository_parent(repository)
    try:
        await command_runner.run(
            ["init", str(repository_path)],
            cwd=repository_path.parent,
        )
        await command_runner.run_json(["log", "-Tjson"], repository_path=repository_path)
    except Exception as exc:
        await _mark_failed(
            session,
            repository_id=repository.id,
            actor=actor,
            request_id=request_id,
            error_code=safe_provisioning_error_code(exc),
        )
        if repository_path.exists():
            shutil.rmtree(repository_path, ignore_errors=True)
        raise ProvisioningFailedError(safe_provisioning_error_code(exc)) from exc

    repository = await session.scalar(select(Repository).where(Repository.id == repository.id))
    if repository is None:
        raise ProvisioningFailedError("repository_not_found_after_provision")
    repository.provisioning_state = RepositoryProvisioningState.READY
    repository.provisioned_at = utc_now()
    repository.provisioning_error_code = None
    await record_audit_event(
        session,
        event_type="repository.provisioned",
        actor_user_id=actor.id,
        organization_id=repository.organization_id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={},
    )
    await session.commit()
    await session.refresh(repository)
    return repository


async def _mark_failed(
    session: AsyncSession,
    *,
    repository_id,
    actor: User,
    request_id: str | None,
    error_code: str,
) -> None:
    repository = await session.scalar(select(Repository).where(Repository.id == repository_id))
    if repository is None:
        return
    repository.provisioning_state = RepositoryProvisioningState.FAILED
    repository.provisioned_at = None
    repository.provisioning_error_code = error_code
    await record_audit_event(
        session,
        event_type="repository.provision_failed",
        actor_user_id=actor.id,
        organization_id=repository.organization_id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={"error_code": error_code},
    )
    await session.commit()
