from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_optional_identity,
    get_request_id,
    get_session,
    require_csrf,
)
from app.domain.enums import RepositoryRole
from app.repositories.organizations import get_membership
from app.repositories.repositories import get_permission
from app.schemas.repositories import (
    RepositoryCreateRequest,
    RepositoryDetailResponse,
    RepositoryPermissionRequest,
    RepositoryPermissionResponse,
    RepositorySummary,
    RepositoryUpdateRequest,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.services.repository_service import (
    create_repository,
    delete_repository_permission,
    get_organization_by_slug_for_repo_routes,
    get_repository_for_actor,
    list_repository_permissions,
    list_visible_repositories,
    update_repository,
    upsert_repository_permission,
)

router = APIRouter(prefix="/organizations/{organization_slug}/repositories", tags=["repositories"])


def _serialize_repository_summary(
    *,
    repository,
    viewer_role,
    can_manage: bool,
    inherited_access: bool,
) -> RepositorySummary:
    return RepositorySummary(
        id=repository.id,
        organization_id=repository.organization_id,
        slug=repository.slug,
        display_name=repository.display_name,
        description=repository.description,
        visibility=repository.visibility,
        created_by_user_id=repository.created_by_user_id,
        created_at=repository.created_at,
        updated_at=repository.updated_at,
        archived_at=repository.archived_at,
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
    )


def _serialize_repository_detail(
    *,
    repository,
    organization_slug: str,
    viewer_role,
    can_manage: bool,
    inherited_access: bool,
) -> RepositoryDetailResponse:
    return RepositoryDetailResponse(
        id=repository.id,
        organization_id=repository.organization_id,
        slug=repository.slug,
        display_name=repository.display_name,
        description=repository.description,
        visibility=repository.visibility,
        created_by_user_id=repository.created_by_user_id,
        created_at=repository.created_at,
        updated_at=repository.updated_at,
        archived_at=repository.archived_at,
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
        organization_slug=organization_slug,
        phase_status="Mercurial repository provisioning is planned for Phase 2.",
    )


def _serialize_permission(permission) -> RepositoryPermissionResponse:
    return RepositoryPermissionResponse(
        id=permission.id,
        repository_id=permission.repository_id,
        user_id=permission.user_id,
        role=permission.role,
        granted_by_user_id=permission.granted_by_user_id,
        created_at=permission.created_at,
        updated_at=permission.updated_at,
        user_email=permission.user.email,
        user_display_name=permission.user.display_name,
    )


@router.get("", response_model=list[RepositorySummary])
async def list_repositories(
    organization_slug: str,
    include_archived: bool = Query(default=False),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> list[RepositorySummary]:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        repositories = await list_visible_repositories(
            session,
            organization=organization,
            actor=identity.user if identity is not None else None,
            include_archived=include_archived,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return [
        _serialize_repository_summary(
            repository=repository,
            viewer_role=viewer_role,
            can_manage=can_manage,
            inherited_access=inherited_access,
        )
        for repository, viewer_role, can_manage, inherited_access in repositories
    ]


@router.post("", response_model=RepositoryDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_repository_route(
    organization_slug: str,
    payload: RepositoryCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> RepositoryDetailResponse:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        membership = await get_membership(
            session, organization_id=organization.id, user_id=identity.user.id
        )
        if membership is None:
            raise ForbiddenError("You do not have permission to create repositories.")
        repository = await create_repository(
            session,
            organization=organization,
            actor=identity.user,
            actor_membership=membership,
            slug=payload.slug,
            display_name=payload.display_name,
            description=payload.description,
            visibility=payload.visibility,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return _serialize_repository_detail(
        repository=repository,
        organization_slug=organization.slug,
        viewer_role=RepositoryRole.ADMIN,
        can_manage=True,
        inherited_access=True,
    )


@router.get("/{repository_slug}", response_model=RepositoryDetailResponse)
async def get_repository(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> RepositoryDetailResponse:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        repository, viewer_role, can_manage, inherited_access = await get_repository_for_actor(
            session,
            organization=organization,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return _serialize_repository_detail(
        repository=repository,
        organization_slug=organization.slug,
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
    )


@router.patch("/{repository_slug}", response_model=RepositoryDetailResponse)
async def patch_repository(
    organization_slug: str,
    repository_slug: str,
    payload: RepositoryUpdateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> RepositoryDetailResponse:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        repository, viewer_role, can_manage, inherited_access = await get_repository_for_actor(
            session,
            organization=organization,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        membership = await get_membership(
            session, organization_id=organization.id, user_id=identity.user.id
        )
        permission = await get_permission(
            session, repository_id=repository.id, user_id=identity.user.id
        )
        repository = await update_repository(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
            actor_membership=membership,
            actor_permission=permission,
            display_name=payload.display_name,
            description=payload.description,
            visibility=payload.visibility,
            archived=payload.archived,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return _serialize_repository_detail(
        repository=repository,
        organization_slug=organization.slug,
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
    )


@router.get("/{repository_slug}/permissions", response_model=list[RepositoryPermissionResponse])
async def get_permissions(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[RepositoryPermissionResponse]:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        repository, _viewer_role, _can_manage, _inherited_access = await get_repository_for_actor(
            session,
            organization=organization,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        permissions = await list_repository_permissions(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return [_serialize_permission(permission) for permission in permissions]


@router.put("/{repository_slug}/permissions/{user_id}", response_model=RepositoryPermissionResponse)
async def put_permission(
    organization_slug: str,
    repository_slug: str,
    user_id: UUID,
    payload: RepositoryPermissionRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> RepositoryPermissionResponse:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        repository, _viewer_role, _can_manage, _inherited_access = await get_repository_for_actor(
            session,
            organization=organization,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        permission = await upsert_repository_permission(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
            target_user_id=user_id,
            role=payload.role,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return _serialize_permission(permission)


@router.delete(
    "/{repository_slug}/permissions/{user_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_permission(
    organization_slug: str,
    repository_slug: str,
    user_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> None:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        repository, _viewer_role, _can_manage, _inherited_access = await get_repository_for_actor(
            session,
            organization=organization,
            repository_slug=repository_slug,
            actor=identity.user,
        )
        await delete_repository_permission(
            session,
            organization=organization,
            repository=repository,
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
