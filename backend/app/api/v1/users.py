from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionIdentity, get_current_identity, get_optional_identity, get_session
from app.api.rate_limit import rate_limited
from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.core.reserved_slugs import is_reserved_slug
from app.core.security import SLUG_RE
from app.models.user import User
from app.schemas.contributions import (
    ContributionActivityResponse,
    ContributionDayResponse,
    ContributionRangeResponse,
)
from app.schemas.organizations import SlugCheckResponse
from app.schemas.users import PublicUserResponse, UserSearchResponse
from app.services.auth_rate_limit import auth_rate_limiter
from app.services.errors import NotFoundError, ValidationFailure
from app.services.user_service import get_public_contributions, get_public_user, search_users

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/check-handle", response_model=SlugCheckResponse)
async def check_user_handle(
    request: Request,
    h: str = Query(..., max_length=80),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SlugCheckResponse:
    client_ip = resolve_client_ip(request, settings)
    retry_after = await auth_rate_limiter.check_and_record_ip_limit(
        "check_handle",
        client_ip,
        settings.auth_check_handle_ip_max_requests,
        settings.auth_check_handle_ip_window_seconds,
        settings=settings,
    )
    if retry_after is not None:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            code="rate_limited",
            detail="Too many handle checks. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    normalized = h.strip().lower()
    if len(normalized) < 2 or len(normalized) > 39 or not SLUG_RE.match(normalized):
        return SlugCheckResponse(available=False, reason="invalid")
    if is_reserved_slug(normalized):
        return SlugCheckResponse(available=False, reason="reserved")
    existing = await session.scalar(select(User.id).where(User.handle == normalized))
    if existing is not None:
        return SlugCheckResponse(available=False, reason="taken")
    return SlugCheckResponse(available=True)


@router.get("/search", response_model=UserSearchResponse)
async def search_users_route(
    q: str = Query(..., min_length=2, max_length=200),
    scope: str | None = Query(default=None, max_length=20),
    org: str | None = Query(default=None, max_length=80),
    repo: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=20, ge=1, le=20),
    _rate_limit: None = Depends(rate_limited("user_search")),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> UserSearchResponse:
    try:
        return await search_users(
            session,
            actor=identity.user,
            q=q,
            scope=scope,
            org_slug=org,
            repo_slug=repo,
            limit=limit,
        )
    except ValidationFailure as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.get("/{handle}", response_model=PublicUserResponse)
async def get_user_profile(
    handle: str,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> PublicUserResponse:
    try:
        viewer = identity.user if identity is not None else None
        return await get_public_user(session, handle=handle, viewer=viewer)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{handle}/contributions", response_model=ContributionActivityResponse)
async def get_user_contributions(
    handle: str,
    period: Literal["last_year"] = Query(default="last_year", alias="range"),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> ContributionActivityResponse:
    del period
    try:
        user = await session.scalar(select(User).where(User.handle == handle))
        if user is None or not user.is_active or user.email_verified_at is None:
            raise NotFoundError("User not found.")
        activity = await get_public_contributions(session, user_id=user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

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
