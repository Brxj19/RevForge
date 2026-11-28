from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import SessionIdentity, get_current_identity, get_session
from app.core.security import utc_now
from app.models.audit_event import AuditEvent
from app.models.organization_member import OrganizationMember
from app.schemas.activity import ActivityEventResponse, ActivityListResponse

router = APIRouter(prefix="/activity", tags=["activity"])

ICON_MAP: list[tuple[list[str], str]] = [
    (["repository.push"], "push"),
    (["transport.hg_http", "transport.hg_ssh"], "pull"),
    (["repository.permission", "organization.member", "admin.break_glass"], "lock"),
    (["ssh_key.", "token."], "key"),
    (["webhook."], "hook"),
    (["auth."], "login"),
    (["repository."], "repo"),
    (["organization."], "org"),
    (["user."], "user"),
]

CATEGORY_PREFIXES: dict[str, list[str]] = {
    "pushes": ["repository.push"],
    "clones": ["transport.hg_http", "transport.hg_ssh"],
    "access": ["repository.permission", "organization.member", "admin.break_glass"],
    "webhooks": ["webhook."],
}

ACTION_MAP: dict[str, str] = {
    "repository.push.accepted": "pushed to",
    "transport.hg_http.authorized": "cloned",
    "transport.hg_http.completed": "accessed",
    "transport.hg_ssh.authorized": "cloned over SSH",
    "repository.permission_granted": "granted access on",
    "repository.permission_changed": "changed access on",
    "repository.permission_revoked": "revoked access on",
    "organization.member_added": "added a member to",
    "organization.member_removed": "removed a member from",
    "organization.member_role_changed": "changed a role in",
    "repository.created": "created repository",
    "repository.updated": "updated repository",
    "repository.deleted": "deleted repository",
    "repository.archived": "archived",
    "repository.unarchived": "unarchived",
    "repository.slug_renamed": "renamed",
    "webhook.created": "added a webhook on",
    "webhook.updated": "updated a webhook on",
    "webhook.deleted": "removed a webhook from",
    "webhook.delivery.sent": "sent a webhook for",
    "webhook.delivery.failed": "webhook delivery failed for",
    "ssh_key.added": "added an SSH key",
    "ssh_key.removed": "removed an SSH key",
    "token.created": "created an access token",
    "token.revoked": "revoked an access token",
    "auth.login.failed": "failed to sign in",
    "auth.login.locked": "sign-in temporarily locked",
}


def _relative_time(event_created_at: object) -> str:
    now = utc_now()
    from datetime import UTC, datetime

    if not isinstance(event_created_at, datetime):
        return ""
    ts = event_created_at if event_created_at.tzinfo else event_created_at.replace(tzinfo=UTC)
    delta = now - ts
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return "now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h"
    days = hours // 24
    if days < 7:
        return f"{days}d"
    weeks = days // 7
    if weeks < 5:
        return f"{weeks}w"
    months = days // 30
    return f"{months}mo"


def _icon_for(event_type: str) -> str:
    for prefixes, icon in ICON_MAP:
        for prefix in prefixes:
            if event_type.startswith(prefix):
                return icon
    return "circle"


def _is_failure(event_type: str) -> bool:
    return any(word in event_type for word in ("failed", "error", "denied", "locked"))


def _present_event(event: AuditEvent) -> ActivityEventResponse:
    meta = event.metadata_json or {}
    event_type = event.event_type

    icon = _icon_for(event_type)
    if _is_failure(event_type):
        icon = "x"

    who = ""
    if event.actor_user:
        who = event.actor_user.display_name or event.actor_user.handle or event.actor_user.email
    elif meta.get("user_display_name"):
        who = str(meta["user_display_name"])

    action = ACTION_MAP.get(event_type, event_type.rsplit(".", 1)[-1].replace("_", " "))

    target = str(meta.get("repository_slug", meta.get("organization_slug", "")))

    ref_parts: list[str] = []
    if event_type == "repository.push.accepted":
        pushed_nodes = meta.get("pushed_nodes")
        raw_count = meta.get("pushed_count")
        count: int | None = int(raw_count) if isinstance(raw_count, int | float) else None
        if count is None and isinstance(pushed_nodes, list):
            count = len(pushed_nodes)
        if count:
            action = f"pushed {count} changeset{'s' if count != 1 else ''} to"
        auth_method = meta.get("authentication_method")
        if auth_method:
            ref_parts.append(str(auth_method))
    elif event_type in ("transport.hg_http.authorized", "transport.hg_ssh.authorized"):
        cmd = meta.get("command_kind")
        if cmd:
            ref_parts.append(f"over {cmd}")
    elif event_type == "repository.permission_granted":
        member = meta.get("member_user_display_name") or meta.get("member_user_email")
        role = meta.get("role")
        if member:
            ref_parts.append(f"to {member}")
        if role:
            ref_parts.append(f"as {role}")

    no_link = not target or event_type.startswith(("ssh_key.", "token.", "auth."))

    return ActivityEventResponse(
        id=str(event.id),
        icon=icon,
        who=who,
        action=action,
        target=target,
        noLink=no_link,
        ref=" ".join(ref_parts),
        time=_relative_time(event.created_at),
        fail=_is_failure(event_type),
    )


@router.get("", response_model=ActivityListResponse)
async def list_activity(
    category: str | None = Query(default=None, max_length=30),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> ActivityListResponse:
    memberships = await session.execute(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == identity.user.id
        )
    )
    org_ids = [row[0] for row in memberships]

    filters = []
    if org_ids:
        filters.append(
            or_(
                AuditEvent.organization_id.in_(org_ids),
                AuditEvent.actor_user_id == identity.user.id,
            )
        )
    else:
        filters.append(AuditEvent.actor_user_id == identity.user.id)

    if category and category != "all":
        if category == "failures":
            filters.append(
                or_(
                    AuditEvent.event_type.ilike("%failed%"),
                    AuditEvent.event_type.ilike("%error%"),
                    AuditEvent.event_type.ilike("%denied%"),
                    AuditEvent.event_type.ilike("%locked%"),
                )
            )
        else:
            prefixes = CATEGORY_PREFIXES.get(category, [])
            if prefixes:
                conditions = [AuditEvent.event_type.startswith(p) for p in prefixes]
                filters.append(or_(*conditions))

    query = (
        select(AuditEvent)
        .options(selectinload(AuditEvent.actor_user))
        .where(*filters)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(query)
    events = list(result.scalars())

    items = [_present_event(e) for e in events]

    if q:
        q_lower = q.lower()
        items = [
            item for item in items if q_lower in item.who.lower() or q_lower in item.target.lower()
        ]

    return ActivityListResponse(items=items)
