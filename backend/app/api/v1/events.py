from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_session,
)
from app.repositories.organizations import get_organization_by_slug
from app.schemas.events import (
    RepositoryEventListResponse,
    RepositoryEventResponse,
)
from app.services.errors import NotFoundError
from app.services.event_service import EventService
from app.services.repository_service import get_repository_for_actor

router = APIRouter(
    prefix="/organizations/{organization_slug}/repositories/{repository_slug}/events",
    tags=["events"],
)


def _get_event_service() -> EventService:
    return EventService()


def _serialize_event(event) -> RepositoryEventResponse:
    return RepositoryEventResponse(
        id=event.id,
        repository_id=event.repository_id,
        event_type=event.event_type,
        actor_user_id=event.actor_user_id,
        authentication_method=event.authentication_method,
        source_ip=event.source_ip,
        request_id=event.request_id,
        payload_json=event.payload_json,
        occurred_at=event.occurred_at,
    )


@router.get("", response_model=RepositoryEventListResponse)
async def list_repository_events(
    organization_slug: str,
    repository_slug: str,
    event_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> RepositoryEventListResponse:
    try:
        organization = await get_organization_by_slug(session, slug=organization_slug)
        if organization is None:
            raise NotFoundError("Organization not found.")
        repository, _vr, _cm, _ia = await get_repository_for_actor(
            session,
            organization=organization,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    service = _get_event_service()
    events = await service.list_repository_events(
        session,
        repository_id=repository.id,
        limit=limit,
        offset=offset,
        event_type=event_type,
    )
    total_count = await service.count_repository_events(
        session,
        repository_id=repository.id,
        event_type=event_type,
    )
    return RepositoryEventListResponse(
        events=[_serialize_event(e) for e in events],
        total_count=total_count,
    )
