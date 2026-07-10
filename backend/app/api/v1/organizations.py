from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_request_id,
    get_session,
    require_csrf,
)
from app.domain.enums import OrganizationRole
from app.schemas.organizations import (
    OrganizationCreateRequest,
    OrganizationDetailResponse,
    OrganizationMemberCreateRequest,
    OrganizationMemberResponse,
    OrganizationMemberUpdateRequest,
    OrganizationSummary,
    OrganizationUpdateRequest,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.services.organization_service import (
    add_member,
    create_organization,
    get_organization_for_user,
    list_organization_members,
    list_organizations_for_user,
    remove_member,
    update_member_role,
    update_organization,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _serialize_organization_summary(*, organization, membership) -> OrganizationSummary:
    return OrganizationSummary(
        id=organization.id,
        slug=organization.slug,
        display_name=organization.display_name,
        description=organization.description,
        created_at=organization.created_at,
        updated_at=organization.updated_at,
        viewer_role=membership.role,
        can_manage=membership.role in {OrganizationRole.OWNER, OrganizationRole.ADMIN},
    )


def _serialize_organization_detail(
    *,
    organization,
    membership,
    member_count: int,
) -> OrganizationDetailResponse:
    return OrganizationDetailResponse(
        id=organization.id,
        slug=organization.slug,
        display_name=organization.display_name,
        description=organization.description,
        created_at=organization.created_at,
        updated_at=organization.updated_at,
        viewer_role=membership.role,
        can_manage=membership.role in {OrganizationRole.OWNER, OrganizationRole.ADMIN},
        member_count=member_count,
    )


def _serialize_member(member) -> OrganizationMemberResponse:
    return OrganizationMemberResponse(
        id=member.id,
        organization_id=member.organization_id,
        user_id=member.user_id,
        role=member.role,
        created_at=member.created_at,
        updated_at=member.updated_at,
        user_email=member.user.email,
        user_display_name=member.user.display_name,
    )


@router.get("", response_model=list[OrganizationSummary])
async def list_organizations(
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[OrganizationSummary]:
    organizations = await list_organizations_for_user(session, user=identity.user)
    return [
        _serialize_organization_summary(organization=organization, membership=membership)
        for organization, membership in organizations
    ]


@router.post("", response_model=OrganizationDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_organization_route(
    payload: OrganizationCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> OrganizationDetailResponse:
    try:
        organization, membership = await create_organization(
            session,
            actor=identity.user,
            slug=payload.slug,
            display_name=payload.display_name,
            description=payload.description,
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

    return _serialize_organization_detail(
        organization=organization,
        membership=membership,
        member_count=1,
    )


@router.get("/{organization_slug}", response_model=OrganizationDetailResponse)
async def get_organization(
    organization_slug: str,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> OrganizationDetailResponse:
    try:
        organization, membership = await get_organization_for_user(
            session,
            slug=organization_slug,
            user=identity.user,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return _serialize_organization_detail(
        organization=organization,
        membership=membership,
        member_count=len(await list_organization_members(session, organization=organization)),
    )


@router.patch("/{organization_slug}", response_model=OrganizationDetailResponse)
async def patch_organization(
    organization_slug: str,
    payload: OrganizationUpdateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> OrganizationDetailResponse:
    try:
        organization, membership = await get_organization_for_user(
            session,
            slug=organization_slug,
            user=identity.user,
        )
        organization = await update_organization(
            session,
            organization=organization,
            membership=membership,
            display_name=payload.display_name,
            description=payload.description,
            actor=identity.user,
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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    member_count = len(await list_organization_members(session, organization=organization))
    return _serialize_organization_detail(
        organization=organization,
        membership=membership,
        member_count=member_count,
    )


@router.get("/{organization_slug}/members", response_model=list[OrganizationMemberResponse])
async def get_members(
    organization_slug: str,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[OrganizationMemberResponse]:
    try:
        organization, _membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    members = await list_organization_members(session, organization=organization)
    return [_serialize_member(member) for member in members]


@router.post(
    "/{organization_slug}/members",
    response_model=OrganizationMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_member(
    organization_slug: str,
    payload: OrganizationMemberCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> OrganizationMemberResponse:
    try:
        organization, membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
        member = await add_member(
            session,
            organization=organization,
            actor_membership=membership,
            actor=identity.user,
            email=payload.email,
            role=payload.role,
            request_id=request_id,
        )
    except (NotFoundError, ValidationFailure) as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND
            if isinstance(exc, NotFoundError)
            else status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return _serialize_member(member)


@router.patch("/{organization_slug}/members/{member_id}", response_model=OrganizationMemberResponse)
async def patch_member(
    organization_slug: str,
    member_id: UUID,
    payload: OrganizationMemberUpdateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> OrganizationMemberResponse:
    try:
        organization, membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
        member = await update_member_role(
            session,
            organization=organization,
            actor_membership=membership,
            actor=identity.user,
            member_id=member_id,
            new_role=payload.role,
            request_id=request_id,
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

    return _serialize_member(member)


@router.delete(
    "/{organization_slug}/members/{member_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_member(
    organization_slug: str,
    member_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> None:
    try:
        organization, membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
        await remove_member(
            session,
            organization=organization,
            actor_membership=membership,
            actor=identity.user,
            member_id=member_id,
            request_id=request_id,
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
