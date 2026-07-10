from __future__ import annotations

import asyncio
import os
import shlex
import sys
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from threading import Lock
from time import monotonic
from uuid import UUID

from mercurial import hg, initialization
from mercurial import ui as uimod
from mercurial.wireprotoserver import sshserver
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.security import validate_slug
from app.mercurial.errors import RepositoryStorageError
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.repositories.organizations import get_membership
from app.services.audit import record_audit_event
from app.services.errors import ForbiddenError, NotFoundError
from app.services.repository_service import (
    get_organization_by_slug_for_repo_routes,
    get_repository_for_actor,
    repository_is_browsable,
)
from app.services.transport_credentials import authenticate_ssh_public_key

initialization.init()


@dataclass(slots=True)
class SshTransportRequest:
    repository_path: str
    organization_slug: str
    repository_slug: str


class TransportRateLimiter:
    def __init__(self, *, max_attempts: int, window_seconds: int) -> None:
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = monotonic()
        window_start = now - self._window_seconds
        with self._lock:
            attempts = [attempt for attempt in self._attempts[key] if attempt >= window_start]
            self._attempts[key] = attempts
            if len(attempts) >= self._max_attempts:
                return False
            attempts.append(now)
            return True


def parse_ssh_original_command(value: str | None) -> SshTransportRequest:
    if value is None or not value.strip():
        raise ValueError("Missing Mercurial SSH command.")
    parts = shlex.split(value)
    if (
        len(parts) != 5
        or parts[0] != "hg"
        or parts[1] != "-R"
        or parts[3] != "serve"
        or parts[4] != "--stdio"
    ):
        raise ValueError("Unsupported Mercurial SSH command.")
    repository_spec = parts[2].lstrip("/")
    repository_parts = [segment for segment in repository_spec.split("/") if segment]
    if len(repository_parts) != 2:
        raise ValueError("Unsupported repository path.")
    organization_slug, repository_slug = repository_parts
    organization_slug = validate_slug(organization_slug)
    repository_slug = validate_slug(repository_slug)
    return SshTransportRequest(
        repository_path=repository_spec,
        organization_slug=organization_slug,
        repository_slug=repository_slug,
    )


class MercurialSshGateway:
    def __init__(
        self,
        *,
        settings: Settings,
        session_factory_getter,
        key_id: UUID,
    ) -> None:
        self._settings = settings
        self._session_factory_getter = session_factory_getter
        self._storage_locator = RepositoryStorageLocator(settings)
        self._key_id = key_id
        self._rate_limiter = TransportRateLimiter(
            max_attempts=settings.transport_rate_limit_max_attempts,
            window_seconds=settings.transport_rate_limit_window_seconds,
        )

    async def run(self) -> None:
        original_command = os.environ.get("SSH_ORIGINAL_COMMAND")
        request = parse_ssh_original_command(original_command)
        limiter_key = f"ssh:{self._key_id}"
        if not self._rate_limiter.allow(limiter_key):
            raise ForbiddenError("Rate limit exceeded.")

        session_factory = self._session_factory_getter()
        async with session_factory() as session:
            actor, key = await authenticate_ssh_public_key(
                session,
                key_id=self._key_id,
                request_id=os.environ.get("REVFORGE_REQUEST_ID"),
            )
            organization = await get_organization_by_repo_slug(
                session, organization_slug=request.organization_slug
            )
            (
                repository,
                _viewer_role,
                _can_manage,
                _inherited_access,
            ) = await get_repository_for_actor(
                session,
                organization=organization,
                repository_slug=request.repository_slug,
                actor=actor,
                allow_archived=False,
            )
            if not repository_is_browsable(repository):
                raise NotFoundError("Repository not found.")

            membership = await get_membership(
                session, organization_id=organization.id, user_id=actor.id
            )
            permission = await self._repository_transport_access(
                session=session,
                actor=actor,
                repository=repository,
                membership=membership,
            )
            if not permission.can_read:
                raise ForbiddenError("Read permission is required.")

            repository_path = self._storage_locator.repository_path(repository)
            baseui = uimod.ui.load()
            baseui.setconfig(b"ui", b"nontty", b"true", b"revforge")
            baseui.setconfig(
                b"revforge",
                b"transport_permission",
                b"write" if permission.can_write else b"read",
                b"revforge",
            )
            for hook_name in (
                b"prechangegroup.revforge",
                b"pretxnchangegroup.revforge",
                b"prepushkey.revforge",
            ):
                baseui.setconfig(
                    b"hooks",
                    hook_name,
                    b"python:app.mercurial.transport_hooks.deny_read_only_write",
                    b"revforge",
                )
            baseui.setconfig(
                b"revforge", b"repository_id", str(repository.id).encode(), b"revforge"
            )
            baseui.setconfig(b"revforge", b"actor_user_id", str(actor.id).encode(), b"revforge")
            baseui.setconfig(b"revforge", b"auth_method", b"ssh_key", b"revforge")
            baseui.setconfig(b"revforge", b"credential_id", str(key.id).encode(), b"revforge")
            baseui.setconfig(
                b"revforge",
                b"request_id",
                (os.environ.get("REVFORGE_REQUEST_ID") or "").encode(),
                b"revforge",
            )
            event_spool_dir = os.environ.get("REVFORGE_EVENT_SPOOL_DIR", "")
            if event_spool_dir:
                baseui.setconfig(
                    b"revforge", b"event_spool_dir", event_spool_dir.encode(), b"revforge"
                )
            baseui.setconfig(
                b"hooks",
                b"changegroup.revforge",
                b"python:app.mercurial.transport_hooks.spool_push_event",
                b"revforge",
            )

            repo = hg.repository(baseui, bytes(str(repository_path), "utf-8"))
            await record_audit_event(
                session,
                event_type="transport.hg_ssh.authorized",
                actor_user_id=actor.id,
                organization_id=organization.id,
                repository_id=repository.id,
                request_id=os.environ.get("REVFORGE_REQUEST_ID"),
                metadata_json={
                    "key_id": str(key.id),
                    "repository_path": request.repository_path,
                    "can_write": permission.can_write,
                },
            )
            await session.commit()

        sshserver(baseui, repo).serve_forever()

    async def _repository_transport_access(
        self,
        *,
        session: AsyncSession,
        actor,
        repository,
        membership,
    ):
        from app.repositories.repositories import get_permission
        from app.services.authorization import repository_access_for_actor

        permission = await get_permission(session, repository_id=repository.id, user_id=actor.id)
        return repository_access_for_actor(actor, membership, repository, permission)


async def get_organization_by_repo_slug(session: AsyncSession, *, organization_slug: str):
    return await get_organization_by_slug_for_repo_routes(
        session, organization_slug=organization_slug
    )


def main(argv: Iterable[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if len(args) != 1:
        raise SystemExit("Usage: python -m app.mercurial.ssh_gateway <ssh-key-id>")
    key_id = UUID(args[0])
    settings = get_settings()

    from app.db.session import SessionLocal

    gateway = MercurialSshGateway(
        settings=settings,
        session_factory_getter=lambda: SessionLocal,
        key_id=key_id,
    )
    try:
        asyncio.run(gateway.run())
    except (ValueError, ForbiddenError, NotFoundError, RepositoryStorageError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
