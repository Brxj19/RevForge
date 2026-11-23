from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_request_id,
    get_session,
    require_csrf,
)
from app.core.reserved_slugs import is_reserved_slug
from app.core.security import SLUG_RE
from app.domain.enums import OrganizationRole
from app.models.invitation import Invitation
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.repositories.organizations import get_organization_by_slug
from app.schemas.organizations import (
    InvitationCreateRequest,
    InvitationCreateResponse,
    InvitationResponse,
    OrganizationCreateRequest,
    OrganizationDetailResponse,
    OrganizationMemberCreateRequest,
    OrganizationMemberResponse,
    OrganizationMemberUpdateRequest,
    OrganizationSummary,
    OrganizationUpdateRequest,
    PaginatedMembersResponse,
    SlugCheckResponse,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.services.invitation_service import (
    create_invitation,
    list_invitations,
    resend_invitation,
    revoke_invitation,
)
from app.services.organization_service import (
    add_member,
    count_organization_repositories,
    create_organization,
    get_organization_for_user,
    list_organization_members,
    list_organization_members_paginated,
    list_organizations_for_user,
    remove_member,
    update_member_role,
    update_organization,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize_organization_summary(
    *, organization: Organization, membership: OrganizationMember
) -> OrganizationSummary:
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
    organization: Organization,
    membership: OrganizationMember,
    member_count: int,
    repository_count: int = 0,
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
        repository_count=repository_count,
    )


def _serialize_member(member: OrganizationMember) -> OrganizationMemberResponse:
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


def _serialize_invitation(invitation: Invitation) -> InvitationResponse:
    return InvitationResponse(
        id=invitation.id,
        organization_id=invitation.organization_id,
        email=invitation.email,
        role=invitation.role,
        status=invitation.status,
        invited_by_email=(invitation.invited_by_user.email if invitation.invited_by_user else None),
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
    )


# ---------------------------------------------------------------------------
# Organization list / create
# ---------------------------------------------------------------------------


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
        repository_count=0,
    )


# ---------------------------------------------------------------------------
# Check-slug — MUST be registered before the /{organization_slug} catch-all
# ---------------------------------------------------------------------------


@router.get("/check-slug", response_model=SlugCheckResponse)
async def check_organization_slug(
    s: str = Query(..., min_length=1, max_length=80),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> SlugCheckResponse:
    normalized = s.strip().lower()
    if len(normalized) < 2 or len(normalized) > 39 or not SLUG_RE.match(normalized):
        return SlugCheckResponse(available=False, reason="invalid")
    if is_reserved_slug(normalized):
        return SlugCheckResponse(available=False, reason="reserved")
    existing = await get_organization_by_slug(session, slug=normalized)
    if existing is not None:
        return SlugCheckResponse(available=False, reason="taken")
    return SlugCheckResponse(available=True)


# ---------------------------------------------------------------------------
# Organization detail / update
# ---------------------------------------------------------------------------


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

    member_count = len(await list_organization_members(session, organization=organization))
    repo_count = await count_organization_repositories(session, organization_id=organization.id)
    return _serialize_organization_detail(
        organization=organization,
        membership=membership,
        member_count=member_count,
        repository_count=repo_count,
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
    repo_count = await count_organization_repositories(session, organization_id=organization.id)
    return _serialize_organization_detail(
        organization=organization,
        membership=membership,
        member_count=member_count,
        repository_count=repo_count,
    )


# ---------------------------------------------------------------------------
# Members — paginated
# ---------------------------------------------------------------------------


@router.get("/{organization_slug}/members", response_model=PaginatedMembersResponse)
async def get_members(
    organization_slug: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=50),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> PaginatedMembersResponse:
    try:
        organization, _membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    members, total = await list_organization_members_paginated(
        session,
        organization_id=organization.id,
        page=page,
        per_page=per_page,
    )
    return PaginatedMembersResponse(
        items=[_serialize_member(member) for member in members],
        total=total,
        page=page,
        per_page=per_page,
    )


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
            user_identifier=payload.user,
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


@router.patch(
    "/{organization_slug}/members/{member_id}",
    response_model=OrganizationMemberResponse,
)
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


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------


@router.get(
    "/{organization_slug}/invitations",
    response_model=list[InvitationResponse],
)
async def get_invitations(
    organization_slug: str,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[InvitationResponse]:
    try:
        organization, membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if membership.role not in {OrganizationRole.OWNER, OrganizationRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view invitations.",
        )

    invitations = await list_invitations(session, organization_id=organization.id)
    return [_serialize_invitation(inv) for inv in invitations]


@router.post(
    "/{organization_slug}/invitations",
    response_model=InvitationCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation_route(
    organization_slug: str,
    payload: InvitationCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> InvitationCreateResponse:
    try:
        organization, membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
        invitation, raw_token = await create_invitation(
            session,
            organization=organization,
            actor_membership=membership,
            actor_user_id=identity.user.id,
            email=payload.email,
            role=payload.role,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    resp = _serialize_invitation(invitation)
    return InvitationCreateResponse(
        **resp.model_dump(),
        token=raw_token,
    )


@router.post(
    "/{organization_slug}/invitations/{invitation_id}/resend",
    response_model=InvitationCreateResponse,
)
async def resend_invitation_route(
    organization_slug: str,
    invitation_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> InvitationCreateResponse:
    try:
        organization, membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if membership.role not in {OrganizationRole.OWNER, OrganizationRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to resend invitations.",
        )

    try:
        invitation, raw_token = await resend_invitation(
            session,
            organization_id=organization.id,
            invitation_id=invitation_id,
            actor_user_id=identity.user.id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    resp = _serialize_invitation(invitation)
    return InvitationCreateResponse(
        **resp.model_dump(),
        token=raw_token,
    )


@router.delete(
    "/{organization_slug}/invitations/{invitation_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_invitation_route(
    organization_slug: str,
    invitation_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> None:
    try:
        organization, membership = await get_organization_for_user(
            session, slug=organization_slug, user=identity.user
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if membership.role not in {OrganizationRole.OWNER, OrganizationRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to revoke invitations.",
        )

    try:
        await revoke_invitation(
            session,
            organization_id=organization.id,
            invitation_id=invitation_id,
            actor_user_id=identity.user.id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
