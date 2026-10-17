from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionIdentity, get_current_identity, get_session
from app.domain.enums import ReviewDecision
from app.schemas.contributions import (
    ContributionActivityResponse,
    ContributionDayResponse,
    ContributionRangeResponse,
)
from app.schemas.pull_requests import (
    MyPullRequestsResponse,
    PullRequestSummaryResponse,
    RepositoryContextResponse,
)
from app.services.contribution_activity import list_user_contribution_activity
from app.services.pull_request_service import MyPullRequestFilter, list_my_pull_requests

router = APIRouter(prefix="/me", tags=["me"])


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
