from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionIdentity, get_current_identity, get_session
from app.schemas.contributions import (
    ContributionActivityResponse,
    ContributionDayResponse,
    ContributionRangeResponse,
)
from app.services.contribution_activity import list_user_contribution_activity

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
