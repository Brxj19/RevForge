from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionIdentity, get_optional_identity, get_session
from app.schemas.search import OrgSearchResponse, RepoSearchResponse
from app.services.search_service import search_organizations, search_repositories

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/repositories", response_model=RepoSearchResponse)
async def search_repositories_route(
    q: str | None = Query(default=None, max_length=200),
    lang: str | None = Query(default=None, max_length=50),
    org: str | None = Query(default=None, max_length=80),
    visibility: str | None = Query(default=None, max_length=20),
    sort: str | None = Query(default=None, max_length=20),
    cursor: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=30, ge=1, le=50),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> RepoSearchResponse:
    actor = identity.user if identity is not None else None
    return await search_repositories(
        session,
        actor=actor,
        q=q,
        lang=lang,
        org=org,
        visibility=visibility,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )


@router.get("/organizations", response_model=OrgSearchResponse)
async def search_organizations_route(
    q: str | None = Query(default=None, max_length=200),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> OrgSearchResponse:
    actor = identity.user if identity is not None else None
    return await search_organizations(session, actor=actor, q=q)
