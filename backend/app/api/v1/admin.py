from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_hg_command_runner,
    get_repository_storage_locator,
    get_request_id,
    get_session,
    require_platform_admin,
    require_platform_admin_csrf,
)
from app.api.rate_limit import rate_limited
from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.domain.enums import PROVISIONING_ERROR_CODES
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.errors import ProvisioningFailedError, ProvisioningInProgressError
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.schemas.admin import (
    AdminHealthResponse,
    AdminOrganizationListResponse,
    AdminOverviewResponse,
    AdminRepositoryItemResponse,
    AdminRepositoryListResponse,
    AdminUserItemResponse,
    AdminUserListResponse,
    BreakGlassSessionListResponse,
    BreakGlassSessionResponse,
    RevokeSessionsResponse,
    StartBreakGlassRequest,
    SuspendUserRequest,
)
from app.services.admin_service import (
    get_admin_health,
    get_admin_overview,
    list_admin_organizations,
    list_admin_repositories,
    list_admin_users,
    list_break_glass_sessions,
    reactivate_user,
    reset_repository_provisioning,
    retry_repository_provisioning,
    revoke_break_glass,
    revoke_user_sessions_admin,
    start_break_glass,
    suspend_user,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get(
    "/overview",
    response_model=AdminOverviewResponse,
    dependencies=[Depends(rate_limited("admin_overview"))],
)
async def admin_overview(
    identity: SessionIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AdminOverviewResponse:
    try:
        return await get_admin_overview(session, actor=identity.user, settings=settings)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get(
    "/health",
    response_model=AdminHealthResponse,
    dependencies=[Depends(rate_limited("admin_health"))],
)
async def admin_health(
    identity: SessionIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AdminHealthResponse:
    try:
        return await get_admin_health(session, actor=identity.user, settings=settings)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/users", response_model=AdminUserListResponse)
async def admin_list_users(
    q: str | None = Query(default=None, max_length=200),
    user_status: Literal["all", "active", "suspended", "platform_admin"] | None = Query(
        default=None, alias="status"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: SessionIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminUserListResponse:
    try:
        return await list_admin_users(
            session,
            actor=identity.user,
            q=q,
            status_filter=user_status,
            limit=limit,
            offset=offset,
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("/users/{user_id}/suspend", response_model=AdminUserItemResponse)
async def admin_suspend_user(
    user_id: UUID,
    payload: SuspendUserRequest,
    identity: SessionIdentity = Depends(require_platform_admin_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
    settings: Settings = Depends(get_settings),
) -> AdminUserItemResponse:
    try:
        return await suspend_user(
            session,
            actor=identity.user,
            target_user_id=user_id,
            reason=payload.reason,
            request_id=request_id,
            settings=settings,
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("/users/{user_id}/reactivate", response_model=AdminUserItemResponse)
async def admin_reactivate_user(
    user_id: UUID,
    identity: SessionIdentity = Depends(require_platform_admin_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
    settings: Settings = Depends(get_settings),
) -> AdminUserItemResponse:
    try:
        return await reactivate_user(
            session,
            actor=identity.user,
            target_user_id=user_id,
            request_id=request_id,
            settings=settings,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("/users/{user_id}/revoke-sessions", response_model=RevokeSessionsResponse)
async def admin_revoke_user_sessions(
    user_id: UUID,
    identity: SessionIdentity = Depends(require_platform_admin_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> RevokeSessionsResponse:
    try:
        return await revoke_user_sessions_admin(
            session,
            actor=identity.user,
            target_user_id=user_id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/organizations", response_model=AdminOrganizationListResponse)
async def admin_list_organizations(
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: SessionIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminOrganizationListResponse:
    try:
        return await list_admin_organizations(
            session, actor=identity.user, q=q, limit=limit, offset=offset
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/repositories", response_model=AdminRepositoryListResponse)
async def admin_list_repositories(
    q: str | None = Query(default=None, max_length=200),
    state: str | None = Query(default=None, max_length=30),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: SessionIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AdminRepositoryListResponse:
    try:
        return await list_admin_repositories(
            session,
            actor=identity.user,
            settings=settings,
            q=q,
            state=state,
            limit=limit,
            offset=offset,
        )
    except ValidationFailure as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post(
    "/repositories/{repository_id}/reset-provisioning",
    response_model=AdminRepositoryItemResponse,
    dependencies=[Depends(rate_limited("admin_reset_provisioning"))],
)
async def admin_reset_provisioning(
    repository_id: UUID,
    identity: SessionIdentity = Depends(require_platform_admin_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
    settings: Settings = Depends(get_settings),
) -> AdminRepositoryItemResponse:
    try:
        return await reset_repository_provisioning(
            session,
            actor=identity.user,
            repository_id=repository_id,
            request_id=request_id,
            settings=settings,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post(
    "/repositories/{repository_id}/retry-provisioning",
    response_model=AdminRepositoryItemResponse,
    dependencies=[Depends(rate_limited("admin_retry_provisioning"))],
)
async def admin_retry_provisioning(
    repository_id: UUID,
    identity: SessionIdentity = Depends(require_platform_admin_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
    settings: Settings = Depends(get_settings),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    command_runner: HgCommandRunner = Depends(get_hg_command_runner),
) -> AdminRepositoryItemResponse:
    try:
        return await retry_repository_provisioning(
            session,
            actor=identity.user,
            repository_id=repository_id,
            request_id=request_id,
            settings=settings,
            storage_locator=storage_locator,
            command_runner=command_runner,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ProvisioningInProgressError as exc:
        await session.rollback()
        raise ApiError(
            409,
            code="provisioning_in_progress",
            detail="Repository provisioning is already in progress.",
        ) from exc
    except ProvisioningFailedError as exc:
        reason = str(exc)
        raise ApiError(
            409,
            code=reason if reason in PROVISIONING_ERROR_CODES else "provisioning_failed",
            detail="Repository provisioning failed.",
        ) from exc


@router.post(
    "/break-glass",
    response_model=BreakGlassSessionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limited("admin_break_glass"))],
)
async def admin_start_break_glass(
    payload: StartBreakGlassRequest,
    identity: SessionIdentity = Depends(require_platform_admin_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> BreakGlassSessionResponse:
    try:
        return await start_break_glass(
            session,
            actor=identity.user,
            org_slug=payload.org_slug,
            repo_slug=payload.repo_slug,
            reason=payload.reason,
            minutes=payload.minutes,
            request_id=request_id,
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/break-glass", response_model=BreakGlassSessionListResponse)
async def admin_list_break_glass(
    active_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: SessionIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> BreakGlassSessionListResponse:
    try:
        return await list_break_glass_sessions(
            session,
            actor=identity.user,
            active_only=active_only,
            limit=limit,
            offset=offset,
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.delete("/break-glass/{session_id}", response_model=BreakGlassSessionResponse)
async def admin_revoke_break_glass(
    session_id: UUID,
    identity: SessionIdentity = Depends(require_platform_admin_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> BreakGlassSessionResponse:
    try:
        return await revoke_break_glass(
            session,
            actor=identity.user,
            session_id=session_id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
