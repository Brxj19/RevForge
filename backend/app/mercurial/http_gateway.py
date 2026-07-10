from __future__ import annotations

import asyncio
import base64
import json
import os
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from threading import Lock
from time import monotonic
from typing import Any
from urllib.parse import parse_qs
from uuid import uuid4

from mercurial import initialization
from mercurial import ui as uimod
from mercurial.hgweb import hgweb_mod
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.domain.enums import RepositoryRole
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.repository import Repository
from app.models.user import User
from app.repositories.organizations import get_membership
from app.services.audit import record_audit_event
from app.services.authentication import AuthenticationError
from app.services.errors import ForbiddenError, NotFoundError
from app.services.repository_service import (
    get_organization_by_slug_for_repo_routes,
    get_repository_for_actor,
    repository_is_browsable,
)
from app.services.transport_credentials import authenticate_personal_access_token

initialization.init()


class TransportCommandKind(StrEnum):
    READ = "read"
    WRITE = "write"


READ_ONLY_COMMANDS = {
    "batch",
    "bookmarks",
    "branchmap",
    "branches",
    "capabilities",
    "changegroupsubset",
    "clonebundles",
    "compresseddiff",
    "between",
    "getbundle",
    "heads",
    "hello",
    "known",
    "listkeys",
    "lookup",
    "stream_out",
    "tip",
}


@dataclass(slots=True)
class TransportAuthorizationResult:
    actor: User | None
    repository: Repository
    repository_path: str
    command_kind: TransportCommandKind
    can_write: bool


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


def classify_hg_http_command(query_string: str) -> TransportCommandKind:
    params = parse_qs(query_string, keep_blank_values=True)
    command = params.get("cmd", [""])[0].strip().lower()
    if not command:
        return TransportCommandKind.WRITE
    if command == "batch":
        return TransportCommandKind.READ
    if command in READ_ONLY_COMMANDS:
        return TransportCommandKind.READ
    return TransportCommandKind.WRITE


def parse_basic_auth(header: str | None) -> tuple[str, str] | None:
    if header is None:
        return None
    scheme, _, encoded = header.partition(" ")
    if scheme.lower() != "basic" or not encoded:
        return None
    try:
        decoded = base64.b64decode(encoded.encode("ascii"), validate=True).decode("utf-8")
    except Exception:
        return None
    username, _, password = decoded.partition(":")
    if not username or not password:
        return None
    return username, password


class HgHttpGatewayApplication:
    def __init__(
        self,
        *,
        settings: Settings,
        session_factory_getter: Callable[[], async_sessionmaker[AsyncSession]],
    ) -> None:
        self._settings = settings
        self._session_factory_getter = session_factory_getter
        self._storage_locator = RepositoryStorageLocator(settings)
        self._rate_limiter = TransportRateLimiter(
            max_attempts=settings.transport_rate_limit_max_attempts,
            window_seconds=settings.transport_rate_limit_window_seconds,
        )

    def __call__(self, environ: dict[str, Any], start_response) -> list[bytes]:
        request_id = environ.get("HTTP_X_REQUEST_ID") or str(uuid4())
        path_info = environ.get("PATH_INFO", "")
        path_segments = [segment for segment in path_info.split("/") if segment]
        if len(path_segments) != 2:
            return self._respond(
                start_response,
                status="404 Not Found",
                body={"error": "Repository not found."},
                request_id=request_id,
            )

        organization_slug, repository_slug = path_segments
        command_kind = classify_hg_http_command(environ.get("QUERY_STRING", ""))
        basic_auth = parse_basic_auth(environ.get("HTTP_AUTHORIZATION"))
        remote_addr = environ.get("REMOTE_ADDR", "unknown")

        try:
            auth_result = asyncio.run(
                self._authorize(
                    organization_slug=organization_slug,
                    repository_slug=repository_slug,
                    command_kind=command_kind,
                    basic_auth=basic_auth,
                    request_id=request_id,
                    remote_addr=remote_addr,
                )
            )
        except ValueError:
            return self._respond(
                start_response,
                status="404 Not Found",
                body={"error": "Repository not found."},
                request_id=request_id,
            )
        except AuthenticationError:
            return self._respond(
                start_response,
                status="401 Unauthorized",
                body={"error": "Authentication required."},
                request_id=request_id,
                headers=[("WWW-Authenticate", 'Basic realm="RevForge Mercurial"')],
            )
        except NotFoundError:
            return self._respond(
                start_response,
                status="404 Not Found",
                body={"error": "Repository not found."},
                request_id=request_id,
            )
        except ForbiddenError:
            return self._respond(
                start_response,
                status="403 Forbidden",
                body={"error": "Access denied."},
                request_id=request_id,
            )

        baseui = uimod.ui.load()
        baseui.setconfig(b"ui", b"nontty", b"true", b"revforge")
        baseui.setconfig(b"web", b"allow_push", b"*", b"revforge")
        request_is_secure = (
            environ.get("wsgi.url_scheme") == "https"
            or environ.get("HTTP_X_FORWARDED_PROTO") == "https"
        )
        baseui.setconfig(
            b"web",
            b"push_ssl",
            b"true" if request_is_secure else b"false",
            b"revforge",
        )
        baseui.setconfig(
            b"revforge",
            b"transport_permission",
            b"write" if auth_result.can_write else b"read",
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
        if auth_result.actor is not None:
            baseui.setconfig(
                b"revforge", b"repository_id", str(auth_result.repository.id).encode(), b"revforge"
            )
            baseui.setconfig(
                b"revforge", b"actor_user_id", str(auth_result.actor.id).encode(), b"revforge"
            )
            baseui.setconfig(
                b"revforge",
                b"auth_method",
                b"http_token" if basic_auth else b"session",
                b"revforge",
            )
            baseui.setconfig(b"revforge", b"source_ip", remote_addr.encode(), b"revforge")
            baseui.setconfig(b"revforge", b"request_id", request_id.encode(), b"revforge")
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

        hg_app = hgweb_mod.hgweb(
            auth_result.repository_path.encode("utf-8"),
            name=f"{organization_slug}/{repository_slug}",
            baseui=baseui,
        )
        status_headers: dict[str, Any] = {}

        def capture_start_response(status: str, headers: list[tuple[str, str]], exc_info=None):
            status_headers["status"] = status
            status_headers["headers"] = headers
            return start_response(status, headers, exc_info)

        hg_environ = environ.copy()
        script_name = hg_environ.get("SCRIPT_NAME", "")
        hg_environ["SCRIPT_NAME"] = (
            f"{script_name.rstrip('/')}/{organization_slug}/{repository_slug}".rstrip("/")
        )
        hg_environ["PATH_INFO"] = "/"
        result = hg_app(hg_environ, capture_start_response)
        try:
            payload = list(result)
        finally:
            close = getattr(result, "close", None)
            if callable(close):
                close()
        asyncio.run(
            self._record_access(
                request_id=request_id,
                organization_slug=organization_slug,
                repository_slug=repository_slug,
                auth_result=auth_result,
                status=status_headers.get("status", "200 OK"),
            )
        )
        return payload

    async def _authorize(
        self,
        *,
        organization_slug: str,
        repository_slug: str,
        command_kind: TransportCommandKind,
        basic_auth: tuple[str, str] | None,
        request_id: str,
        remote_addr: str,
    ) -> TransportAuthorizationResult:
        session_factory = self._session_factory_getter()
        async with session_factory() as session:
            actor = None
            token = None
            if command_kind == TransportCommandKind.WRITE and basic_auth is None:
                raise AuthenticationError("Authentication required.")
            if basic_auth is not None:
                username, password = basic_auth
                limiter_key = f"http:{remote_addr}:{username}"
                if not self._rate_limiter.allow(limiter_key):
                    raise ForbiddenError("Rate limit exceeded.")
                actor, token = await authenticate_personal_access_token(
                    session,
                    settings=self._settings,
                    username=username,
                    raw_token=password,
                    request_id=request_id,
                )

            organization = await get_organization_by_repo_slug(
                session, organization_slug=organization_slug
            )
            (
                repository,
                _viewer_role,
                _can_manage,
                _inherited_access,
            ) = await get_repository_for_actor(
                session,
                organization=organization,
                repository_slug=repository_slug,
                actor=actor,
                allow_archived=False,
            )
            if not repository_is_browsable(repository):
                raise NotFoundError("Repository not found.")

            repository_path = self._storage_locator.repository_path(repository)
            membership = None
            if actor is not None:
                membership = await get_membership(
                    session, organization_id=organization.id, user_id=actor.id
                )
            access = await self._repository_transport_access(
                session=session,
                actor=actor,
                organization=organization,
                repository=repository,
                membership=membership,
            )
            if token is not None and token.capability == RepositoryRole.READ:
                access.can_write = False
            if command_kind == TransportCommandKind.WRITE and not access.can_write:
                raise ForbiddenError("Write permission is required.")

            await record_audit_event(
                session,
                event_type="transport.hg_http.authorized",
                actor_user_id=actor.id if actor is not None else None,
                organization_id=organization.id,
                repository_id=repository.id,
                request_id=request_id,
                metadata_json={
                    "command_kind": command_kind.value,
                    "token_used": str(token.id) if token is not None else None,
                },
            )
            await session.commit()
            return TransportAuthorizationResult(
                actor=actor,
                repository=repository,
                repository_path=str(repository_path),
                command_kind=command_kind,
                can_write=access.can_write,
            )

    async def _repository_transport_access(
        self,
        *,
        session: AsyncSession,
        actor: User | None,
        organization,
        repository: Repository,
        membership,
    ):
        from app.repositories.repositories import get_permission
        from app.services.authorization import repository_access_for_actor

        permission = None
        if actor is not None:
            permission = await get_permission(
                session, repository_id=repository.id, user_id=actor.id
            )
        return repository_access_for_actor(actor, membership, repository, permission)

    async def _record_access(
        self,
        *,
        request_id: str,
        organization_slug: str,
        repository_slug: str,
        auth_result: TransportAuthorizationResult,
        status: str,
    ) -> None:
        session_factory = self._session_factory_getter()
        async with session_factory() as session:
            await record_audit_event(
                session,
                event_type="transport.hg_http.completed",
                actor_user_id=auth_result.actor.id if auth_result.actor is not None else None,
                request_id=request_id,
                organization_id=auth_result.repository.organization_id,
                repository_id=auth_result.repository.id,
                metadata_json={
                    "organization_slug": organization_slug,
                    "repository_slug": repository_slug,
                    "command_kind": auth_result.command_kind.value,
                    "status": status,
                },
            )
            await session.commit()

    def _respond(
        self,
        start_response,
        *,
        status: str,
        body: dict[str, Any],
        request_id: str,
        headers: list[tuple[str, str]] | None = None,
    ) -> list[bytes]:
        payload = json.dumps(body).encode("utf-8")
        response_headers = [
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(payload))),
            ("X-Request-ID", request_id),
        ]
        if headers:
            response_headers.extend(headers)
        start_response(status, response_headers)
        return [payload]


async def get_organization_by_repo_slug(session: AsyncSession, *, organization_slug: str):
    return await get_organization_by_slug_for_repo_routes(
        session, organization_slug=organization_slug
    )
