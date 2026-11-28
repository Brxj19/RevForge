from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_request_id,
    get_session,
    require_csrf,
    require_platform_admin,
)
from app.domain.enums import OrganizationRole, ReviewDecision
from app.models.user import User
from app.schemas.admin import BreakGlassSessionResponse
from app.schemas.contributions import (
    ContributionActivityResponse,
    ContributionDayResponse,
    ContributionRangeResponse,
)
from app.schemas.me import (
    NotificationSettingsResponse,
    PinListRequest,
    PinListResponse,
    PinRef,
    UserPreferences,
    UserProfileResponse,
    UserUpdateRequest,
)
from app.schemas.notifications import (
    MarkReadRequest,
    MarkReadResponse,
    NotificationListResponse,
    NotificationResponse,
)
from app.schemas.organizations import (
    InvitationAcceptResponse,
    OrganizationSummary,
    PendingUserInvitationResponse,
)
from app.schemas.pull_requests import (
    MyPullRequestsResponse,
    PullRequestSummaryResponse,
    RepositoryContextResponse,
)
from app.services.admin_service import get_active_break_glass_for_actor
from app.services.contribution_activity import list_user_contribution_activity
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.services.invitation_service import (
    accept_invitation_by_id,
    decline_invitation_by_id,
    list_pending_invitations_for_user,
)
from app.services.notification_service import (
    get_unread_count,
    list_notifications,
    mark_notifications_read,
)
from app.services.pull_request_service import MyPullRequestFilter, list_my_pull_requests
from app.services.repository_service import get_repository_access_for_actor
from app.services.user_settings import (
    get_notification_settings,
    get_user_pins,
    get_user_preferences,
    get_user_profile,
    update_notification_settings,
    update_user_pins,
    update_user_preferences,
    update_user_profile,
)


@dataclass(slots=True)
class AttentionItem:
    type: str
    title: str
    description: str
    href: str
    severity: str


router = APIRouter(prefix="/me", tags=["me"])


@router.get("/break-glass", response_model=BreakGlassSessionResponse | None)
async def get_my_break_glass(
    identity: SessionIdentity = Depends(require_platform_admin),
    session: AsyncSession = Depends(get_session),
) -> BreakGlassSessionResponse | None:
    try:
        return await get_active_break_glass_for_actor(session, actor=identity.user)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/contributions", response_model=ContributionActivityResponse)
async def get_contributions(
    period: Literal["last_year"] = Query(default="last_year", alias="range"),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> ContributionActivityResponse:
    del period
    activity = await list_user_contribution_activity(session, user_id=identity.user.id)
    return ContributionActivityResponse(
        total=activity.total,
        range=ContributionRangeResponse(
            start_date=activity.start_date,
            end_date=activity.end_date,
        ),
        days=[
            ContributionDayResponse(date=activity_date, count=count)
            for activity_date, count in activity.daily_counts
        ],
    )


@router.get("/pull-requests", response_model=MyPullRequestsResponse)
async def list_my_pull_requests_route(
    filter: MyPullRequestFilter = Query(default="authored"),
    limit: int = Query(default=30, ge=1, le=100),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> MyPullRequestsResponse:
    prs = await list_my_pull_requests(
        session, user_id=identity.user.id, filter_=filter, limit=limit
    )
    items: list[PullRequestSummaryResponse] = []
    for pr in prs:
        repo = pr.repository
        try:
            await get_repository_access_for_actor(
                session,
                organization=repo.organization,
                repository_slug=repo.slug,
                actor=identity.user,
                allow_archived=True,
                allow_break_glass=False,
            )
        except NotFoundError:
            # A review request or prior authorship never grants repository access.
            continue
        org_slug = getattr(getattr(repo, "organization", None), "slug", "unknown")
        pr_reviews = getattr(pr, "reviews", [])
        pr_reviewers = getattr(pr, "reviewers", [])
        pr_comments = getattr(pr, "comments", [])
        items.append(
            PullRequestSummaryResponse(
                id=pr.id,
                repository_id=pr.repository_id,
                number=pr.number,
                title=pr.title,
                description=pr.description,
                state=pr.state,
                source_revision=pr.source_revision,
                target_revision=pr.target_revision,
                source_branch=pr.source_branch,
                target_branch=pr.target_branch,
                author_id=pr.author_id,
                merger_id=pr.merger_id,
                merged_revision=pr.merged_revision,
                merged_at=pr.merged_at,
                closed_at=pr.closed_at,
                created_at=pr.created_at,
                updated_at=pr.updated_at,
                approval_count=sum(1 for r in pr_reviews if r.decision == ReviewDecision.APPROVED),
                changes_requested_count=sum(
                    1 for r in pr_reviews if r.decision == ReviewDecision.CHANGES_REQUESTED
                ),
                reviewer_count=len(pr_reviewers),
                comment_count=len(pr_comments),
                repository=RepositoryContextResponse(
                    org=org_slug,
                    repo=repo.slug,
                ),
            )
        )
    return MyPullRequestsResponse(pull_requests=items)


@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> UserProfileResponse:
    return await get_user_profile(session, user=identity.user)


@router.patch("/profile", response_model=UserProfileResponse)
async def patch_profile(
    payload: UserUpdateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> UserProfileResponse:
    try:
        return await update_user_profile(
            session,
            user=identity.user,
            payload=payload,
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


@router.get("/preferences", response_model=UserPreferences)
async def get_preferences_route(
    identity: SessionIdentity = Depends(get_current_identity),
) -> UserPreferences:
    return get_user_preferences(identity.user)


@router.put("/preferences", response_model=UserPreferences)
async def put_preferences(
    preferences: UserPreferences,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> UserPreferences:
    return await update_user_preferences(session, user=identity.user, preferences=preferences)


@router.get("/pins", response_model=PinListResponse)
async def get_pins(
    identity: SessionIdentity = Depends(get_current_identity),
) -> PinListResponse:
    raw = get_user_pins(identity.user)
    return PinListResponse(items=[PinRef(**p) for p in raw])


@router.put("/pins", response_model=PinListResponse)
async def put_pins(
    payload: PinListRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> PinListResponse:
    pin_dicts = [p.model_dump() for p in payload.items]
    try:
        raw = await update_user_pins(session, user=identity.user, pins=pin_dicts)
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return PinListResponse(items=[PinRef(**p) for p in raw])


@router.get("/notification-settings", response_model=NotificationSettingsResponse)
async def get_notification_settings_route(
    identity: SessionIdentity = Depends(get_current_identity),
) -> NotificationSettingsResponse:
    return get_notification_settings(identity.user)


@router.put("/notification-settings", response_model=NotificationSettingsResponse)
async def put_notification_settings(
    settings: NotificationSettingsResponse,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> NotificationSettingsResponse:
    try:
        return await update_notification_settings(
            session,
            user=identity.user,
            settings=settings,
            request_id=request_id,
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications_route(
    unread: bool = Query(default=False),
    cursor: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=30, ge=1, le=100),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> NotificationListResponse:
    notifications = await list_notifications(
        session, user_id=identity.user.id, unread_only=unread, cursor=cursor, limit=limit
    )
    unread_count = await get_unread_count(session, user_id=identity.user.id)
    return NotificationListResponse(
        items=[
            NotificationResponse(
                id=n.id,
                type=n.type,
                title=n.title,
                body=n.body,
                icon=n.icon,
                href=n.href,
                is_read=n.is_read,
                created_at=n.created_at,
            )
            for n in notifications
        ],
        unread_count=unread_count,
    )


@router.post("/notifications/read", response_model=MarkReadResponse)
async def mark_notifications_read_route(
    payload: MarkReadRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> MarkReadResponse:
    marked = await mark_notifications_read(session, user_id=identity.user.id, ids=payload.ids)
    await session.commit()
    return MarkReadResponse(marked=marked)


# ---------------------------------------------------------------------------
# Pending organization invitations for the signed-in user
# ---------------------------------------------------------------------------


@router.get("/invitations", response_model=list[PendingUserInvitationResponse])
async def list_my_invitations_route(
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[PendingUserInvitationResponse]:
    invitations = await list_pending_invitations_for_user(session, user=identity.user)
    return [
        PendingUserInvitationResponse(
            id=inv.id,
            organization_id=inv.organization_id,
            organization_slug=inv.organization.slug,
            organization_display_name=inv.organization.display_name,
            role=inv.role,
            invited_by_name=(
                inv.invited_by_user.display_name if inv.invited_by_user is not None else None
            ),
            created_at=inv.created_at,
            expires_at=inv.expires_at,
        )
        for inv in invitations
    ]


@router.post("/invitations/{invitation_id}/accept", response_model=InvitationAcceptResponse)
async def accept_my_invitation_route(
    invitation_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> InvitationAcceptResponse:
    try:
        invitation, _membership = await accept_invitation_by_id(
            session,
            invitation_id=invitation_id,
            user=identity.user,
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

    org = invitation.organization
    return InvitationAcceptResponse(
        organization=OrganizationSummary(
            id=org.id,
            slug=org.slug,
            display_name=org.display_name,
            description=org.description,
            created_at=org.created_at,
            updated_at=org.updated_at,
            viewer_role=OrganizationRole(invitation.role),
            can_manage=invitation.role in {"owner", "admin"},
        ),
        role=invitation.role,
    )


@router.post(
    "/invitations/{invitation_id}/decline",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def decline_my_invitation_route(
    invitation_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> None:
    try:
        await decline_invitation_by_id(
            session,
            invitation_id=invitation_id,
            user=identity.user,
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


# ---------------------------------------------------------------------------
# Attention
# ---------------------------------------------------------------------------


@router.get("/attention")
async def get_attention(
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[AttentionItem]]:
    items = await _build_attention_items(session, user=identity.user)
    return {"items": items}


async def _build_attention_items(session: AsyncSession, *, user: User) -> list[AttentionItem]:
    """Gather attention items: failing webhooks, stuck provisioning, pending reviews."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.core.security import utc_now
    from app.domain.enums import RepositoryProvisioningState
    from app.models.organization import Organization
    from app.models.organization_member import OrganizationMember
    from app.models.pull_request import PullRequest, PullRequestReviewer
    from app.models.repository import Repository
    from app.models.webhook import Webhook, WebhookDelivery

    items: list[AttentionItem] = []

    # Get orgs where user is admin/owner.
    admin_orgs = await session.execute(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == user.id,
            OrganizationMember.role.in_(["owner", "admin"]),
        )
    )
    admin_org_ids = set(admin_orgs.scalars())

    if admin_org_ids:
        # Failing webhooks: repos in user's admin orgs with recent delivery failures.
        failing_webhooks = await session.execute(
            select(Webhook, Repository, Organization)
            .join(Repository, Webhook.repository_id == Repository.id)
            .join(Organization, Repository.organization_id == Organization.id)
            .where(
                Repository.organization_id.in_(admin_org_ids),
                Webhook.is_active == True,  # noqa: E712
            )
        )
        for webhook, repo, org in failing_webhooks.all():
            # Check last 3 deliveries for this webhook.
            recent_deliveries = await session.execute(
                select(WebhookDelivery)
                .where(WebhookDelivery.webhook_id == webhook.id)
                .order_by(WebhookDelivery.created_at.desc())
                .limit(3)
            )
            deliveries = list(recent_deliveries.scalars())
            if len(deliveries) >= 3 and all(d.status == "failed" for d in deliveries):
                items.append(
                    AttentionItem(
                        type="webhook_failing",
                        title=f"Webhook failing: {webhook.url}",
                        description=f"Last 3 deliveries failed for {org.slug}/{repo.slug}",
                        href=f"/{org.slug}/{repo.slug}/settings/webhooks",
                        severity="warning",
                    )
                )

        # Stuck provisioning: repos stuck in PROVISIONING for >10 min.
        from datetime import timedelta

        stale_cutoff = utc_now() - timedelta(minutes=10)
        stuck_repos = await session.execute(
            select(Repository, Organization)
            .join(Organization, Repository.organization_id == Organization.id)
            .where(
                Repository.organization_id.in_(admin_org_ids),
                Repository.provisioning_state == RepositoryProvisioningState.PROVISIONING,
                Repository.provisioning_started_at < stale_cutoff,
            )
        )
        for repo, org in stuck_repos.all():
            items.append(
                AttentionItem(
                    type="stuck_provisioning",
                    title=f"Repository provisioning stuck: {repo.slug}",
                    description=(
                        f"{org.slug}/{repo.slug} has been provisioning for over 10 minutes"
                    ),
                    href=f"/{org.slug}/{repo.slug}",
                    severity="warning",
                )
            )

    # Pending review requests on user's PRs.
    pending_reviews = await session.execute(
        select(PullRequestReviewer)
        .join(PullRequest, PullRequestReviewer.pull_request_id == PullRequest.id)
        .options(selectinload(PullRequestReviewer.pull_request))
        .where(
            PullRequestReviewer.reviewer_id == user.id,
            PullRequest.state == "open",
        )
        .limit(10)
    )
    for reviewer in pending_reviews.scalars():
        pr = reviewer.pull_request
        items.append(
            AttentionItem(
                type="review_requested",
                title=f"Review requested: {pr.title}",
                description=f"PR #{pr.number}",
                href=f"/pr/{pr.id}",
                severity="info",
            )
        )

    return items
