from __future__ import annotations

import csv
import io
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import SessionIdentity, get_current_identity, get_session
from app.api.rate_limit import enforce_rate_limit
from app.core.config import Settings, get_settings
from app.domain.enums import OrganizationRole
from app.models.audit_event import AuditEvent
from app.repositories.organizations import get_membership
from app.schemas.audit import (
    AuditEventDetailResponse,
    AuditEventListResponse,
    AuditEventResponse,
)
from app.services.activity_presenter import present_activity

router = APIRouter(prefix="/audit", tags=["audit"])

# Category to event_type prefix mapping.
CATEGORY_PREFIXES: dict[str, list[str]] = {
    "pushes": ["repository.push"],
    "clones": ["transport.hg_http", "transport.hg_ssh"],
    "access": ["repository.permission", "organization.member", "admin.break_glass"],
    "auth": [
        "auth.",
        "user.logged_",
        "user.registered",
        "user.session",
        "token.",
        "ssh_key.",
        "admin.user.",
    ],
    "webhooks": ["webhook."],
    "failures": [],  # Special handling.
}

_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _escape_csv_cell(value: str) -> str:
    """Prevent CSV formula injection including leading whitespace/control characters."""
    if not value:
        return value
    stripped = value.lstrip()
    if value[0] in _CSV_FORMULA_PREFIXES or (stripped and stripped[0] in _CSV_FORMULA_PREFIXES):
        return "'" + value
    return value


def _category_filters(category: str) -> list[ColumnElement[bool]]:
    """Build SQLAlchemy filter expressions for a category."""
    prefixes = CATEGORY_PREFIXES.get(category, [])
    if category == "failures":
        # Events with failure indicators in event_type.
        return [
            or_(
                AuditEvent.event_type.ilike("%failed%"),
                AuditEvent.event_type.ilike("%error%"),
                AuditEvent.event_type.ilike("%denied%"),
                AuditEvent.event_type.ilike("%locked%"),
            )
        ]
    if not prefixes:
        return []
    conditions = [AuditEvent.event_type.startswith(p) for p in prefixes]
    return [or_(*conditions)]


@router.get("", response_model=AuditEventListResponse)
async def list_audit_events(
    request: Request,
    event_type: str | None = Query(default=None),
    category: str | None = Query(default=None, max_length=30),
    severity: Literal["all", "high", "normal"] | None = Query(default=None),
    scope: Literal["default", "all"] = Query(default="default"),
    organization_id: UUID | None = Query(default=None),
    repository_id: UUID | None = Query(default=None),
    actor_user_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    format: str | None = Query(default=None, max_length=10),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AuditEventListResponse | StreamingResponse:
    filters: list[ColumnElement[bool]] = []

    if scope == "all":
        if not identity.user.is_active or not identity.user.is_platform_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Platform admin access required.",
            )
        if organization_id:
            filters.append(AuditEvent.organization_id == organization_id)
        if repository_id:
            filters.append(AuditEvent.repository_id == repository_id)
        if actor_user_id:
            filters.append(AuditEvent.actor_user_id == actor_user_id)
    elif organization_id:
        # Org admin required.
        membership = await get_membership(
            session, organization_id=organization_id, user_id=identity.user.id
        )
        if membership is None or membership.role not in {
            OrganizationRole.OWNER,
            OrganizationRole.ADMIN,
        }:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization admin access required.",
            )
        filters.append(AuditEvent.organization_id == organization_id)
        if actor_user_id:
            filters.append(AuditEvent.actor_user_id == actor_user_id)
    elif repository_id:
        filters.append(AuditEvent.repository_id == repository_id)
        filters.append(AuditEvent.actor_user_id == identity.user.id)
    else:
        filters.append(AuditEvent.actor_user_id == identity.user.id)

    if event_type:
        filters.append(AuditEvent.event_type == event_type)
    if severity and severity != "all":
        filters.append(AuditEvent.severity == severity)
    if category:
        cat_filters = _category_filters(category)
        filters.extend(cat_filters)

    query = (
        select(AuditEvent)
        .options(selectinload(AuditEvent.actor_user))
        .where(*filters)
        .order_by(AuditEvent.created_at.desc())
    )

    if format == "csv":
        enforce_rate_limit("audit_csv", request=request, identity=identity, settings=settings)
        # CSV export: cap at 10,000 rows, rate limited.
        csv_query = query.limit(10_000)
        result = await session.execute(csv_query)
        events = list(result.scalars())
        return _build_csv_response(events)

    query = query.offset(offset).limit(limit)
    count_query = select(func.count()).select_from(AuditEvent).where(*filters)
    result = await session.execute(query)
    total_count = await session.scalar(count_query) or 0
    responses: list[AuditEventResponse] = []
    for event in result.scalars():
        presented = present_activity(event.event_type, event.metadata_json)
        responses.append(
            AuditEventResponse(
                id=event.id,
                actor_user_id=event.actor_user_id,
                actor_display_name=event.actor_user.display_name if event.actor_user else None,
                actor_email=event.actor_user.email if event.actor_user else None,
                organization_id=event.organization_id,
                repository_id=event.repository_id,
                event_type=event.event_type,
                severity=event.severity,
                request_id=event.request_id,
                summary=presented.summary,
                details=[
                    AuditEventDetailResponse(label=detail.label, value=detail.value)
                    for detail in presented.details
                ],
                created_at=event.created_at,
            )
        )
    return AuditEventListResponse(events=responses, total_count=total_count)


def _build_csv_response(events: list[AuditEvent]) -> StreamingResponse:
    """Build a streaming CSV response with formula-escaped cells."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "event_type",
            "severity",
            "actor_user_id",
            "organization_id",
            "repository_id",
            "summary",
            "created_at",
        ]
    )
    for event in events:
        presented = present_activity(event.event_type, event.metadata_json)
        writer.writerow(
            [
                _escape_csv_cell(str(event.id)),
                _escape_csv_cell(event.event_type),
                _escape_csv_cell(event.severity),
                _escape_csv_cell(str(event.actor_user_id or "")),
                _escape_csv_cell(str(event.organization_id or "")),
                _escape_csv_cell(str(event.repository_id or "")),
                _escape_csv_cell(presented.summary),
                _escape_csv_cell(str(event.created_at)),
            ]
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_events.csv"},
    )
