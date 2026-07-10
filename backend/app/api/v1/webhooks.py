from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_session,
    require_csrf,
)
from app.models.repository import Repository
from app.schemas.events import (
    WebhookCreateRequest,
    WebhookDeliveryResponse,
    WebhookResponse,
    WebhookUpdateRequest,
)
from app.services.errors import ForbiddenError, NotFoundError
from app.services.repository_service import (
    get_organization_by_slug_for_repo_routes,
    get_repository_for_actor,
)
from app.services.webhook_service import WebhookService

router = APIRouter(
    prefix="/organizations/{organization_slug}/repositories/{repository_slug}/webhooks",
    tags=["webhooks"],
)


async def _get_repo_for_admin(
    session: AsyncSession,
    *,
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity,
) -> Repository:
    organization = await get_organization_by_slug_for_repo_routes(
        session, organization_slug=organization_slug
    )
    repository, _vr, can_manage, _ia = await get_repository_for_actor(
        session,
        organization=organization,
        repository_slug=repository_slug,
        actor=identity.user,
        allow_archived=True,
    )
    if not can_manage:
        raise ForbiddenError("Repository admin access required.")
    return repository


def _get_webhook_service() -> WebhookService:
    from app.core.config import get_settings

    return WebhookService(get_settings())


def _serialize_webhook(webhook) -> WebhookResponse:
    return WebhookResponse(
        id=webhook.id,
        repository_id=webhook.repository_id,
        url=webhook.url,
        event_types=webhook.event_types,
        is_active=webhook.is_active,
        created_by_user_id=webhook.created_by_user_id,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


def _serialize_delivery(delivery) -> WebhookDeliveryResponse:
    return WebhookDeliveryResponse(
        id=delivery.id,
        webhook_id=delivery.webhook_id,
        event_type=delivery.event_type,
        request_url=delivery.request_url,
        response_status_code=delivery.response_status_code,
        status=delivery.status,
        retry_count=delivery.retry_count,
        error_message=delivery.error_message,
        created_at=delivery.created_at,
        completed_at=delivery.completed_at,
    )


@router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[WebhookResponse]:
    try:
        repository = await _get_repo_for_admin(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        service = _get_webhook_service()
        webhooks = await service.list_webhooks(session, repository_id=repository.id)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [_serialize_webhook(w) for w in webhooks]


@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    organization_slug: str,
    repository_slug: str,
    payload: WebhookCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> WebhookResponse:
    try:
        repository = await _get_repo_for_admin(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        service = _get_webhook_service()
        webhook = await service.create_webhook(
            session,
            repository_id=repository.id,
            url=payload.url,
            event_types=payload.event_types,
            secret=payload.secret,
            created_by_user_id=identity.user.id,
        )
        await session.commit()
        await session.refresh(webhook)
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _serialize_webhook(webhook)


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    organization_slug: str,
    repository_slug: str,
    webhook_id: UUID,
    payload: WebhookUpdateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> WebhookResponse:
    try:
        await _get_repo_for_admin(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        service = _get_webhook_service()
        webhook = await service.update_webhook(
            session,
            webhook_id=webhook_id,
            url=payload.url,
            event_types=payload.event_types,
            is_active=payload.is_active,
        )
        if webhook is None:
            raise NotFoundError("Webhook not found.")
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _serialize_webhook(webhook)


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_webhook(
    organization_slug: str,
    repository_slug: str,
    webhook_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        await _get_repo_for_admin(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        service = _get_webhook_service()
        deleted = await service.delete_webhook(session, webhook_id=webhook_id)
        if not deleted:
            raise NotFoundError("Webhook not found.")
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{webhook_id}/deliveries", response_model=list[WebhookDeliveryResponse])
async def list_webhook_deliveries(
    organization_slug: str,
    repository_slug: str,
    webhook_id: UUID,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[WebhookDeliveryResponse]:
    try:
        await _get_repo_for_admin(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        service = _get_webhook_service()
        deliveries = await service.list_deliveries(
            session,
            webhook_id=webhook_id,
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [_serialize_delivery(d) for d in deliveries]
