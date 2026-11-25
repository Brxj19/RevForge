from __future__ import annotations

import shutil
from datetime import timedelta
from pathlib import Path
from typing import Literal
from uuid import UUID

import structlog
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.security import ensure_utc, utc_now, validate_slug
from app.domain.enums import OrganizationRole, RepositoryProvisioningState
from app.mercurial.authorized_keys import sync_authorized_keys
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.errors import ProvisioningFailedError
from app.mercurial.provisioning_service import (
    provision_repository,
    public_provisioning_error,
)
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.audit_event import AuditEvent
from app.models.break_glass_session import BreakGlassSession
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.personal_access_token import PersonalAccessToken
from app.models.repository import Repository
from app.models.repository_event import EventSpoolEntry
from app.models.user import User
from app.models.user_session import UserSession
from app.models.webhook import Webhook, WebhookDelivery
from app.repositories.organizations import get_organization_by_slug
from app.repositories.repositories import get_repository_by_slug
from app.schemas.admin import (
    AdminAttentionItem,
    AdminHealthComponentResponse,
    AdminHealthResponse,
    AdminOrganizationItemResponse,
    AdminOrganizationListResponse,
    AdminOverviewResponse,
    AdminRepositoryItemResponse,
    AdminRepositoryListResponse,
    AdminUserItemResponse,
    AdminUserListResponse,
    BreakGlassSessionListResponse,
    BreakGlassSessionResponse,
    RevokeSessionsResponse,
)
from app.services.audit import record_audit_event
from app.services.authorization import require_platform_admin
from app.services.errors import ConflictError, NotFoundError, ValidationFailure
from app.services.notification_service import create_notification

logger = structlog.get_logger(__name__)

ALLOWED_BREAK_GLASS_MINUTES = frozenset({15, 60, 240})
DEFAULT_STALE_CLAIM_SECONDS = 600


def _validate_reason(
    reason: str,
    *,
    min_len: int,
    max_len: int = 500,
    field_name: str = "Reason",
) -> str:
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in reason):
        raise ValidationFailure(f"{field_name} cannot contain control characters.")
    cleaned = reason.strip()
    if len(cleaned) < min_len or len(cleaned) > max_len:
        raise ValidationFailure(f"{field_name} must be between {min_len} and {max_len} characters.")
    return cleaned


def _disk_usage_for_root(root_path: str) -> tuple[int, int] | None:
    probe = Path(root_path).resolve()
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    try:
        usage = shutil.disk_usage(probe)
    except OSError:
        return None
    return usage.used, usage.total


def _safe_directory_size(path: Path) -> int:
    try:
        if not path.exists() or path.is_symlink() or not path.is_dir():
            return 0
        total = 0
        for entry in path.rglob("*"):
            try:
                if entry.is_symlink() or not entry.is_file():
                    continue
                total += entry.stat().st_size
            except OSError:
                continue
        return total
    except OSError:
        return 0


def _serialize_break_glass(
    bg: BreakGlassSession,
    *,
    org_slug: str,
    repo_slug: str,
    actor_email: str | None = None,
    actor_display_name: str | None = None,
) -> BreakGlassSessionResponse:
    now = utc_now()
    active = bg.revoked_at is None and ensure_utc(bg.expires_at) > now
    return BreakGlassSessionResponse(
        id=bg.id,
        actor_user_id=bg.actor_user_id,
        actor_email=actor_email,
        actor_display_name=actor_display_name,
        organization_id=bg.organization_id,
        repository_id=bg.repository_id,
        org=org_slug,
        repo=repo_slug,
        reason=bg.reason,
        duration_minutes=bg.duration_minutes,
        minutes=bg.duration_minutes,
        created_at=bg.created_at,
        expires_at=bg.expires_at,
        revoked_at=bg.revoked_at,
        ended_at=bg.revoked_at,
        active=active,
    )


async def _serialize_admin_user(
    session: AsyncSession,
    user: User,
    *,
    sessions_revoked: int | None = None,
) -> AdminUserItemResponse:
    now = utc_now()
    all_sessions = list(
        await session.scalars(select(UserSession).where(UserSession.user_id == user.id))
    )
    active_session_count = sum(
        1 for s in all_sessions if s.revoked_at is None and ensure_utc(s.expires_at) > now
    )
    seen_timestamps = [
        ensure_utc(s.last_seen_at) for s in all_sessions if s.last_seen_at is not None
    ]
    last_active_at = max(seen_timestamps) if seen_timestamps else None

    org_slugs = list(
        await session.scalars(
            select(Organization.slug)
            .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
            .where(OrganizationMember.user_id == user.id)
            .order_by(Organization.slug.asc())
        )
    )
    return AdminUserItemResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        handle=user.handle,
        is_active=user.is_active,
        is_platform_admin=user.is_platform_admin,
        suspended_at=user.suspended_at,
        suspended_reason=user.suspended_reason,
        organizations=org_slugs,
        last_active_at=last_active_at,
        active_session_count=active_session_count,
        organization_count=len(org_slugs),
        sessions_revoked=sessions_revoked,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _serialize_admin_repository(
    repo: Repository,
    *,
    org_slug: str,
    storage_locator: RepositoryStorageLocator,
) -> AdminRepositoryItemResponse:
    size_bytes = 0
    if repo.provisioning_state == RepositoryProvisioningState.READY:
        try:
            repo_path = storage_locator.repository_path(repo)
            size_bytes = _safe_directory_size(repo_path)
        except Exception:
            size_bytes = 0
    return AdminRepositoryItemResponse(
        id=repo.id,
        organization_slug=org_slug,
        slug=repo.slug,
        visibility=repo.visibility,
        provisioning_state=repo.provisioning_state,
        provisioning_error=public_provisioning_error(repo),
        provisioning_started_at=repo.provisioning_started_at,
        archived_at=repo.archived_at,
        size_bytes=size_bytes,
        updated_at=repo.updated_at,
    )


async def get_admin_overview(
    session: AsyncSession,
    *,
    actor: User | None,
    settings: Settings,
) -> AdminOverviewResponse:
    require_platform_admin(actor)

    now = utc_now()
    stale_prov_cutoff = now - timedelta(seconds=settings.provisioning_stale_after_seconds)
    stale_claim_cutoff = now - timedelta(seconds=DEFAULT_STALE_CLAIM_SECONDS)
    day_ago = now - timedelta(hours=24)

    users_count = int(await session.scalar(select(func.count(User.id))) or 0)
    suspended_count = int(
        await session.scalar(select(func.count(User.id)).where(User.is_active.is_(False))) or 0
    )
    orgs_count = int(await session.scalar(select(func.count(Organization.id))) or 0)
    repos_count = int(await session.scalar(select(func.count(Repository.id))) or 0)
    failed_prov = int(
        await session.scalar(
            select(func.count(Repository.id)).where(
                Repository.provisioning_state == RepositoryProvisioningState.FAILED
            )
        )
        or 0
    )
    stuck_prov = int(
        await session.scalar(
            select(func.count(Repository.id)).where(
                Repository.provisioning_state == RepositoryProvisioningState.PROVISIONING,
                or_(
                    Repository.provisioning_started_at.is_(None),
                    Repository.provisioning_started_at <= stale_prov_cutoff,
                ),
            )
        )
        or 0
    )

    spool_backlog = int(
        await session.scalar(
            select(func.count(EventSpoolEntry.id)).where(
                EventSpoolEntry.status.in_(("pending", "claimed"))
            )
        )
        or 0
    )
    stale_claims = int(
        await session.scalar(
            select(func.count(EventSpoolEntry.id)).where(
                EventSpoolEntry.status == "claimed",
                EventSpoolEntry.claimed_at.is_not(None),
                EventSpoolEntry.claimed_at <= stale_claim_cutoff,
            )
        )
        or 0
    )
    failed_logins_24h = int(
        await session.scalar(
            select(func.count(AuditEvent.id)).where(
                AuditEvent.created_at >= day_ago,
                or_(
                    AuditEvent.event_type == "auth.login.failed",
                    AuditEvent.event_type == "user.login.failed",
                    AuditEvent.event_type == "user.login_failed",
                ),
            )
        )
        or 0
    )

    usage = _disk_usage_for_root(settings.repository_root)
    storage_bytes, storage_total_bytes = usage if usage is not None else (0, 0)

    attention: list[AdminAttentionItem] = []
    if stuck_prov > 0:
        attention.append(
            AdminAttentionItem(
                kind="provisioning",
                title=f"{stuck_prov} repository provisioning job(s) stuck",
                detail="Reset stuck provisioning runs before retrying.",
                href="/admin/repositories?state=provisioning",
                severity="warning",
            )
        )
    if failed_prov > 0:
        attention.append(
            AdminAttentionItem(
                kind="provisioning",
                title=f"{failed_prov} repository provisioning job(s) failed",
                detail="Inspect failed repositories and retry provisioning.",
                href="/admin/repositories?state=failed",
                severity="warning",
            )
        )
    if stale_claims > 0:
        attention.append(
            AdminAttentionItem(
                kind="stale_claims",
                title=f"{stale_claims} stale event spool claim(s)",
                detail="Worker claims exceeded timeout and await reclamation.",
                href="/admin/system",
                severity="warning",
            )
        )
    if suspended_count > 0:
        attention.append(
            AdminAttentionItem(
                kind="lockout",
                title=f"{suspended_count} suspended user account(s)",
                detail="Review suspended accounts in user management.",
                href="/admin/users?status=suspended",
                severity="info",
            )
        )

    return AdminOverviewResponse(
        users=users_count,
        suspended=suspended_count,
        organizations=orgs_count,
        repositories=repos_count,
        failed_provisioning=failed_prov,
        stuck_provisioning=stuck_prov,
        storage_bytes=storage_bytes,
        storage_total_bytes=storage_total_bytes,
        spool_backlog=spool_backlog,
        stale_claims=stale_claims,
        failed_logins_24h=failed_logins_24h,
        paused_accounts=suspended_count,
        attention=attention,
    )


async def get_admin_health(
    session: AsyncSession,
    *,
    actor: User | None,
    settings: Settings,
) -> AdminHealthResponse:
    require_platform_admin(actor)

    components: list[AdminHealthComponentResponse] = [
        AdminHealthComponentResponse(
            name="api",
            status="healthy",
            detail="Control plane API responding.",
        )
    ]

    # Database check (sanitized: never leak DSN or raw driver errors).
    db_ok = False
    try:
        await session.execute(select(1))
        db_ok = True
    except Exception:
        db_ok = False
    components.append(
        AdminHealthComponentResponse(
            name="database",
            status="healthy" if db_ok else "down",
            detail=(
                "Database connection healthy." if db_ok else "Database connectivity check failed."
            ),
        )
    )

    # SSH gateway check (sanitized: never expose configured paths).
    auth_keys_path = Path(settings.ssh_authorized_keys_path)
    ssh_status: Literal["healthy", "degraded", "down"]
    if auth_keys_path.exists():
        ssh_status = "healthy"
        ssh_detail = "SSH authorized_keys file present."
    elif auth_keys_path.parent.exists():
        ssh_status = "healthy"
        ssh_detail = "SSH authorized_keys directory ready."
    else:
        ssh_status = "degraded"
        ssh_detail = "SSH authorized_keys target not yet initialized."
    components.append(
        AdminHealthComponentResponse(
            name="ssh_gateway",
            status=ssh_status,
            detail=ssh_detail,
        )
    )

    # HTTP gateway check.
    components.append(
        AdminHealthComponentResponse(
            name="http_gateway",
            status="healthy",
            detail="Mercurial HTTP gateway configured.",
        )
    )

    # Event worker check.
    now = utc_now()
    stale_claim_cutoff = now - timedelta(seconds=DEFAULT_STALE_CLAIM_SECONDS)
    stale_claims = int(
        await session.scalar(
            select(func.count(EventSpoolEntry.id)).where(
                EventSpoolEntry.status == "claimed",
                EventSpoolEntry.claimed_at.is_not(None),
                EventSpoolEntry.claimed_at <= stale_claim_cutoff,
            )
        )
        or 0
    )
    dead_letter_count = int(
        await session.scalar(
            select(func.count(EventSpoolEntry.id)).where(EventSpoolEntry.status == "dead_letter")
        )
        or 0
    )
    worker_status: Literal["healthy", "degraded", "down"]
    if stale_claims > 0 or dead_letter_count > 0:
        worker_status = "degraded"
        worker_detail = (
            f"{stale_claims} stale claim(s) and {dead_letter_count} dead-letter event(s)."
        )
    else:
        worker_status = "healthy"
        worker_detail = "Event spool healthy with no stale claims."
    components.append(
        AdminHealthComponentResponse(
            name="event_worker",
            status=worker_status,
            detail=worker_detail,
        )
    )

    # Webhook delivery check (last 24h failures on active webhooks).
    day_ago = now - timedelta(hours=24)
    failing_webhooks = int(
        await session.scalar(
            select(func.count(func.distinct(WebhookDelivery.webhook_id)))
            .join(Webhook, WebhookDelivery.webhook_id == Webhook.id)
            .where(
                Webhook.is_active.is_(True),
                WebhookDelivery.status == "failed",
                WebhookDelivery.created_at >= day_ago,
            )
        )
        or 0
    )
    webhook_status: Literal["healthy", "degraded", "down"]
    if failing_webhooks > 0:
        webhook_status = "degraded"
        webhook_detail = (
            f"{failing_webhooks} active webhook(s) had delivery failures in the last 24h."
        )
    else:
        webhook_status = "healthy"
        webhook_detail = "No recent webhook delivery failures."
    components.append(
        AdminHealthComponentResponse(
            name="webhook_delivery",
            status=webhook_status,
            detail=webhook_detail,
        )
    )

    # Storage capacity check (sanitized: percentage only, never paths).
    usage = _disk_usage_for_root(settings.repository_root)
    if usage is None or usage[1] <= 0:
        components.append(
            AdminHealthComponentResponse(
                name="storage",
                status="down",
                detail="Storage capacity check failed.",
            )
        )
    else:
        used, total = usage
        pct = (used / total) * 100.0
        storage_status: Literal["healthy", "degraded", "down"]
        if pct >= 95.0:
            storage_status = "down"
            storage_detail = f"Storage capacity critical ({pct:.1f}% used)."
        elif pct >= 85.0:
            storage_status = "degraded"
            storage_detail = f"Storage capacity high ({pct:.1f}% used)."
        else:
            storage_status = "healthy"
            storage_detail = f"Storage capacity nominal ({pct:.1f}% used)."
        components.append(
            AdminHealthComponentResponse(
                name="storage",
                status=storage_status,
                detail=storage_detail,
            )
        )

    return AdminHealthResponse(components=components)


async def list_admin_users(
    session: AsyncSession,
    *,
    actor: User | None,
    q: str | None = None,
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AdminUserListResponse:
    require_platform_admin(actor)

    filters = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
                User.handle.ilike(pattern),
            )
        )
    if status_filter == "active":
        filters.append(User.is_active.is_(True))
    elif status_filter == "suspended":
        filters.append(User.is_active.is_(False))
    elif status_filter == "platform_admin":
        filters.append(User.is_platform_admin.is_(True))

    total = int(await session.scalar(select(func.count(User.id)).where(*filters)) or 0)
    users = list(
        await session.scalars(
            select(User)
            .where(*filters)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    items = [await _serialize_admin_user(session, user) for user in users]
    return AdminUserListResponse(items=items, total=total, limit=limit, offset=offset)


async def suspend_user(
    session: AsyncSession,
    *,
    actor: User | None,
    target_user_id: UUID,
    reason: str,
    request_id: str | None,
    settings: Settings,
) -> AdminUserItemResponse:
    verified_actor = require_platform_admin(actor)
    cleaned_reason = _validate_reason(
        reason, min_len=3, max_len=500, field_name="Suspension reason"
    )

    if target_user_id == verified_actor.id:
        raise ConflictError("You cannot suspend your own account.")

    target = await session.scalar(select(User).where(User.id == target_user_id).with_for_update())
    if target is None:
        raise NotFoundError("User not found.")
    if not target.is_active:
        raise ConflictError("User is already suspended.")

    if target.is_platform_admin:
        active_admins = list(
            await session.scalars(
                select(User)
                .where(User.is_platform_admin.is_(True), User.is_active.is_(True))
                .order_by(User.id.asc())
                .with_for_update()
            )
        )
        if len(active_admins) <= 1:
            raise ConflictError("Cannot suspend the last active platform admin.")

    now = utc_now()
    target.is_active = False
    target.suspended_at = now
    target.suspended_reason = cleaned_reason

    revoked_sessions_res = await session.execute(
        update(UserSession)
        .where(
            UserSession.user_id == target.id,
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    revoked_sessions = int(getattr(revoked_sessions_res, "rowcount", 0) or 0)

    revoked_bg_res = await session.execute(
        update(BreakGlassSession)
        .where(
            BreakGlassSession.actor_user_id == target.id,
            BreakGlassSession.revoked_at.is_(None),
        )
        .values(revoked_at=now, revoked_by_user_id=verified_actor.id)
    )
    revoked_bg = int(getattr(revoked_bg_res, "rowcount", 0) or 0)

    await record_audit_event(
        session,
        event_type="admin.user.suspended",
        actor_user_id=verified_actor.id,
        request_id=request_id,
        severity="high",
        metadata_json={
            "target_user_id": str(target.id),
            "user_email": target.email,
            "user_display_name": target.display_name,
            "reason": cleaned_reason,
            "sessions_revoked": revoked_sessions,
            "break_glass_revoked": revoked_bg,
        },
    )
    await session.commit()
    await session.refresh(target)

    try:
        await sync_authorized_keys(session, output_path=Path(settings.ssh_authorized_keys_path))
    except OSError:
        logger.warning("admin.authorized_keys_sync_failed", action="suspend_user")

    return await _serialize_admin_user(session, target, sessions_revoked=revoked_sessions)


async def reactivate_user(
    session: AsyncSession,
    *,
    actor: User | None,
    target_user_id: UUID,
    request_id: str | None,
    settings: Settings,
) -> AdminUserItemResponse:
    verified_actor = require_platform_admin(actor)

    target = await session.scalar(select(User).where(User.id == target_user_id).with_for_update())
    if target is None:
        raise NotFoundError("User not found.")

    target.is_active = True
    target.suspended_at = None
    target.suspended_reason = None

    await record_audit_event(
        session,
        event_type="admin.user.reactivated",
        actor_user_id=verified_actor.id,
        request_id=request_id,
        severity="high",
        metadata_json={
            "target_user_id": str(target.id),
            "user_email": target.email,
            "user_display_name": target.display_name,
        },
    )
    await session.commit()
    await session.refresh(target)

    try:
        await sync_authorized_keys(session, output_path=Path(settings.ssh_authorized_keys_path))
    except OSError:
        logger.warning("admin.authorized_keys_sync_failed", action="reactivate_user")

    return await _serialize_admin_user(session, target)


async def revoke_user_sessions_admin(
    session: AsyncSession,
    *,
    actor: User | None,
    target_user_id: UUID,
    request_id: str | None,
) -> RevokeSessionsResponse:
    verified_actor = require_platform_admin(actor)

    target = await session.get(User, target_user_id)
    if target is None:
        raise NotFoundError("User not found.")

    now = utc_now()
    result = await session.execute(
        update(UserSession)
        .where(
            UserSession.user_id == target.id,
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    revoked_count = int(getattr(result, "rowcount", 0) or 0)

    token_result = await session.execute(
        update(PersonalAccessToken)
        .where(
            PersonalAccessToken.user_id == target.id,
            PersonalAccessToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    tokens_revoked = int(getattr(token_result, "rowcount", 0) or 0)

    bg_result = await session.execute(
        update(BreakGlassSession)
        .where(
            BreakGlassSession.actor_user_id == target.id,
            BreakGlassSession.revoked_at.is_(None),
        )
        .values(revoked_at=now, revoked_by_user_id=verified_actor.id)
    )
    break_glass_revoked = int(getattr(bg_result, "rowcount", 0) or 0)

    await record_audit_event(
        session,
        event_type="admin.user.sessions_revoked",
        actor_user_id=verified_actor.id,
        request_id=request_id,
        severity="high",
        metadata_json={
            "target_user_id": str(target.id),
            "user_email": target.email,
            "user_display_name": target.display_name,
            "sessions_revoked": revoked_count,
            "tokens_revoked": tokens_revoked,
            "break_glass_revoked": break_glass_revoked,
        },
    )
    await session.commit()
    return RevokeSessionsResponse(
        id=target.id,
        user_id=target.id,
        sessions_revoked=revoked_count,
        revoked_count=revoked_count,
    )


async def list_admin_organizations(
    session: AsyncSession,
    *,
    actor: User | None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AdminOrganizationListResponse:
    require_platform_admin(actor)

    filters = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                Organization.slug.ilike(pattern),
                Organization.display_name.ilike(pattern),
            )
        )

    total = int(await session.scalar(select(func.count(Organization.id)).where(*filters)) or 0)
    orgs = list(
        await session.scalars(
            select(Organization)
            .where(*filters)
            .order_by(Organization.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    items: list[AdminOrganizationItemResponse] = []
    for org in orgs:
        owner_rows = await session.scalars(
            select(User)
            .join(OrganizationMember, OrganizationMember.user_id == User.id)
            .where(
                OrganizationMember.organization_id == org.id,
                OrganizationMember.role == OrganizationRole.OWNER,
            )
            .order_by(User.email.asc())
        )
        owners = [owner.display_name for owner in owner_rows]
        repo_count = int(
            await session.scalar(
                select(func.count(Repository.id)).where(Repository.organization_id == org.id)
            )
            or 0
        )
        member_count = int(
            await session.scalar(
                select(func.count(OrganizationMember.id)).where(
                    OrganizationMember.organization_id == org.id
                )
            )
            or 0
        )
        items.append(
            AdminOrganizationItemResponse(
                id=org.id,
                slug=org.slug,
                display_name=org.display_name,
                owners=owners,
                repository_count=repo_count,
                member_count=member_count,
                created_at=org.created_at,
            )
        )

    return AdminOrganizationListResponse(items=items, total=total, limit=limit, offset=offset)


async def list_admin_repositories(
    session: AsyncSession,
    *,
    actor: User | None,
    settings: Settings,
    q: str | None = None,
    state: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AdminRepositoryListResponse:
    require_platform_admin(actor)

    filters = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                Repository.slug.ilike(pattern),
                Repository.display_name.ilike(pattern),
                Organization.slug.ilike(pattern),
            )
        )
    if state and state != "all":
        if state == "stuck":
            cutoff = utc_now() - timedelta(seconds=settings.provisioning_stale_after_seconds)
            filters.append(
                Repository.provisioning_state == RepositoryProvisioningState.PROVISIONING
            )
            filters.append(
                or_(
                    Repository.provisioning_started_at.is_(None),
                    Repository.provisioning_started_at <= cutoff,
                )
            )
        elif state == "archived":
            filters.append(Repository.archived_at.is_not(None))
        else:
            try:
                state_enum = RepositoryProvisioningState(state)
            except ValueError as exc:
                raise ValidationFailure(f"Invalid repository state filter: {state!r}") from exc
            filters.append(Repository.provisioning_state == state_enum)

    total = int(
        await session.scalar(
            select(func.count(Repository.id))
            .join(Organization, Repository.organization_id == Organization.id)
            .where(*filters)
        )
        or 0
    )
    rows = await session.execute(
        select(Repository, Organization.slug)
        .join(Organization, Repository.organization_id == Organization.id)
        .where(*filters)
        .order_by(Repository.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    storage_locator = RepositoryStorageLocator(settings)
    items = [
        _serialize_admin_repository(repo, org_slug=org_slug, storage_locator=storage_locator)
        for repo, org_slug in rows.all()
    ]
    return AdminRepositoryListResponse(items=items, total=total, limit=limit, offset=offset)


async def reset_repository_provisioning(
    session: AsyncSession,
    *,
    actor: User | None,
    repository_id: UUID,
    request_id: str | None,
    settings: Settings,
) -> AdminRepositoryItemResponse:
    verified_actor = require_platform_admin(actor)

    repo = await session.scalar(
        select(Repository)
        .options(selectinload(Repository.organization))
        .where(Repository.id == repository_id)
        .with_for_update()
    )
    if repo is None:
        raise NotFoundError("Repository not found.")
    if repo.archived_at is not None:
        raise ConflictError("Archived repositories cannot have provisioning reset.")
    if repo.provisioning_state == RepositoryProvisioningState.READY:
        raise ConflictError("Ready repositories cannot have provisioning reset.")
    if repo.provisioning_state not in {
        RepositoryProvisioningState.PROVISIONING,
        RepositoryProvisioningState.FAILED,
    }:
        raise ConflictError("Only provisioning or failed repositories can have provisioning reset.")

    previous_state = repo.provisioning_state.value
    previous_attempt_id = (
        str(repo.provisioning_attempt_id) if repo.provisioning_attempt_id is not None else None
    )

    repo.provisioning_state = RepositoryProvisioningState.FAILED
    repo.provisioning_error_code = "provisioning_stale"
    repo.provisioning_started_at = None
    repo.provisioning_attempt_id = None

    org_slug = repo.organization.slug if repo.organization is not None else "unknown"
    await record_audit_event(
        session,
        event_type="admin.repository.provisioning_reset",
        actor_user_id=verified_actor.id,
        organization_id=repo.organization_id,
        repository_id=repo.id,
        request_id=request_id,
        severity="high",
        metadata_json={
            "organization_slug": org_slug,
            "repository_slug": repo.slug,
            "previous_state": previous_state,
            "previous_attempt_id": previous_attempt_id,
        },
    )
    await session.commit()
    await session.refresh(repo)

    storage_locator = RepositoryStorageLocator(settings)
    return _serialize_admin_repository(repo, org_slug=org_slug, storage_locator=storage_locator)


async def retry_repository_provisioning(
    session: AsyncSession,
    *,
    actor: User | None,
    repository_id: UUID,
    request_id: str | None,
    settings: Settings,
    storage_locator: RepositoryStorageLocator,
    command_runner: HgCommandRunner,
) -> AdminRepositoryItemResponse:
    verified_actor = require_platform_admin(actor)

    repo = await session.scalar(
        select(Repository)
        .options(selectinload(Repository.organization))
        .where(Repository.id == repository_id)
    )
    if repo is None:
        raise NotFoundError("Repository not found.")
    if repo.archived_at is not None:
        raise ConflictError("Archived repositories cannot be provisioned.")
    if repo.provisioning_state == RepositoryProvisioningState.READY:
        raise ConflictError("Repository is already provisioned.")
    if repo.provisioning_state == RepositoryProvisioningState.PROVISIONING:
        raise ConflictError(
            "Repository provisioning is currently in progress. Reset it first if stuck."
        )

    org_slug = repo.organization.slug if repo.organization is not None else "unknown"
    org_id = repo.organization_id
    repo_slug = repo.slug

    try:
        provisioned = await provision_repository(
            session,
            repository_id=repo.id,
            actor=verified_actor,
            request_id=request_id,
            storage_locator=storage_locator,
            command_runner=command_runner,
            stale_after_seconds=settings.provisioning_stale_after_seconds,
        )
    except ProvisioningFailedError as exc:
        await record_audit_event(
            session,
            event_type="admin.repository.provisioning_retried",
            actor_user_id=verified_actor.id,
            organization_id=org_id,
            repository_id=repository_id,
            request_id=request_id,
            severity="high",
            metadata_json={
                "organization_slug": org_slug,
                "repository_slug": repo_slug,
                "status": f"failed:{exc}",
            },
        )
        await session.commit()
        raise

    await record_audit_event(
        session,
        event_type="admin.repository.provisioning_retried",
        actor_user_id=verified_actor.id,
        organization_id=org_id,
        repository_id=provisioned.id,
        request_id=request_id,
        severity="high",
        metadata_json={
            "organization_slug": org_slug,
            "repository_slug": repo_slug,
            "status": "ready",
        },
    )
    await session.commit()
    return _serialize_admin_repository(
        provisioned, org_slug=org_slug, storage_locator=storage_locator
    )


async def start_break_glass(
    session: AsyncSession,
    *,
    actor: User | None,
    org_slug: str,
    repo_slug: str,
    reason: str,
    minutes: int,
    request_id: str | None,
) -> BreakGlassSessionResponse:
    verified_actor = require_platform_admin(actor)

    if minutes not in ALLOWED_BREAK_GLASS_MINUTES:
        raise ValidationFailure("Break-glass duration must be 15, 60, or 240 minutes.")
    cleaned_reason = _validate_reason(
        reason, min_len=10, max_len=500, field_name="Break-glass reason"
    )

    try:
        normalized_org = validate_slug(org_slug)
        normalized_repo = validate_slug(repo_slug)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    organization = await get_organization_by_slug(session, slug=normalized_org)
    if organization is None:
        raise NotFoundError("Repository not found.")
    repository = await get_repository_by_slug(
        session, organization_id=organization.id, slug=normalized_repo
    )
    if repository is None:
        raise NotFoundError("Repository not found.")

    # Serialize concurrent break-glass starts per platform admin.
    await session.scalar(select(User.id).where(User.id == verified_actor.id).with_for_update())

    now = utc_now()
    existing_candidates = await session.scalars(
        select(BreakGlassSession).where(
            BreakGlassSession.actor_user_id == verified_actor.id,
            BreakGlassSession.revoked_at.is_(None),
        )
    )
    if any(ensure_utc(bg.expires_at) > now for bg in existing_candidates):
        raise ConflictError("You already have an active break-glass session.")

    expires_at = now + timedelta(minutes=minutes)
    bg = BreakGlassSession(
        actor_user_id=verified_actor.id,
        organization_id=organization.id,
        repository_id=repository.id,
        reason=cleaned_reason,
        duration_minutes=minutes,
        expires_at=expires_at,
        request_id=request_id,
    )
    session.add(bg)
    await session.flush()

    await record_audit_event(
        session,
        event_type="admin.break_glass.started",
        actor_user_id=verified_actor.id,
        organization_id=organization.id,
        repository_id=repository.id,
        request_id=request_id,
        severity="high",
        metadata_json={
            "break_glass_session_id": str(bg.id),
            "reason": cleaned_reason,
            "duration_minutes": minutes,
            "expires_at": expires_at.isoformat(),
            "organization_slug": organization.slug,
            "repository_slug": repository.slug,
        },
    )

    # Notify all active organization owners.
    org_owners = list(
        await session.scalars(
            select(User)
            .join(OrganizationMember, OrganizationMember.user_id == User.id)
            .where(
                OrganizationMember.organization_id == organization.id,
                OrganizationMember.role == OrganizationRole.OWNER,
                User.is_active.is_(True),
            )
        )
    )
    for owner in org_owners:
        await create_notification(
            session,
            user_id=owner.id,
            type="break_glass_started",
            title=f"Break-glass access started on {organization.slug}/{repository.slug}",
            body=(
                f"{verified_actor.display_name} started a {minutes}-minute read-only "
                f"break-glass session. Reason: {cleaned_reason}"
            ),
            icon="shield-alert",
            href=f"/org/{organization.slug}/audit",
        )

    await session.commit()
    await session.refresh(bg)
    return _serialize_break_glass(
        bg,
        org_slug=organization.slug,
        repo_slug=repository.slug,
        actor_email=verified_actor.email,
        actor_display_name=verified_actor.display_name,
    )


async def list_break_glass_sessions(
    session: AsyncSession,
    *,
    actor: User | None,
    active_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> BreakGlassSessionListResponse:
    verified_actor = require_platform_admin(actor)

    result = await session.execute(
        select(BreakGlassSession)
        .options(
            selectinload(BreakGlassSession.actor_user),
            selectinload(BreakGlassSession.organization),
            selectinload(BreakGlassSession.repository),
        )
        .order_by(BreakGlassSession.created_at.desc())
    )
    all_sessions = list(result.scalars())
    serialized_all = [
        _serialize_break_glass(
            bg,
            org_slug=bg.organization.slug if bg.organization else "unknown",
            repo_slug=bg.repository.slug if bg.repository else "unknown",
            actor_email=bg.actor_user.email if bg.actor_user else None,
            actor_display_name=bg.actor_user.display_name if bg.actor_user else None,
        )
        for bg in all_sessions
    ]
    actor_active = next(
        (s for s in serialized_all if s.active and s.actor_user_id == verified_actor.id),
        None,
    )
    recent = [s for s in serialized_all if not s.active]
    filtered = [s for s in serialized_all if s.active] if active_only else serialized_all
    total = len(filtered)
    page = filtered[offset : offset + limit]
    return BreakGlassSessionListResponse(
        active=actor_active,
        recent=recent[:limit],
        items=page,
        total=total,
        limit=limit,
        offset=offset,
    )


async def revoke_break_glass(
    session: AsyncSession,
    *,
    actor: User | None,
    session_id: UUID,
    request_id: str | None,
) -> BreakGlassSessionResponse:
    verified_actor = require_platform_admin(actor)

    bg = await session.scalar(
        select(BreakGlassSession)
        .options(
            selectinload(BreakGlassSession.actor_user),
            selectinload(BreakGlassSession.organization),
            selectinload(BreakGlassSession.repository),
        )
        .where(BreakGlassSession.id == session_id)
    )
    if bg is None:
        raise NotFoundError("Break-glass session not found.")

    org_slug = bg.organization.slug if bg.organization else "unknown"
    repo_slug = bg.repository.slug if bg.repository else "unknown"

    if bg.revoked_at is None:
        bg.revoked_at = utc_now()
        bg.revoked_by_user_id = verified_actor.id
        await record_audit_event(
            session,
            event_type="admin.break_glass.revoked",
            actor_user_id=verified_actor.id,
            organization_id=bg.organization_id,
            repository_id=bg.repository_id,
            request_id=request_id,
            severity="high",
            metadata_json={
                "break_glass_session_id": str(bg.id),
                "organization_slug": org_slug,
                "repository_slug": repo_slug,
            },
        )
        await session.commit()
        await session.refresh(bg)

    return _serialize_break_glass(
        bg,
        org_slug=org_slug,
        repo_slug=repo_slug,
        actor_email=bg.actor_user.email if bg.actor_user else None,
        actor_display_name=bg.actor_user.display_name if bg.actor_user else None,
    )


async def get_active_break_glass_for_actor(
    session: AsyncSession,
    *,
    actor: User | None,
) -> BreakGlassSessionResponse | None:
    verified_actor = require_platform_admin(actor)

    candidates = await session.scalars(
        select(BreakGlassSession)
        .options(
            selectinload(BreakGlassSession.organization),
            selectinload(BreakGlassSession.repository),
        )
        .where(
            BreakGlassSession.actor_user_id == verified_actor.id,
            BreakGlassSession.revoked_at.is_(None),
        )
        .order_by(BreakGlassSession.created_at.desc())
    )
    now = utc_now()
    active = next(
        (bg for bg in candidates if ensure_utc(bg.expires_at) > now),
        None,
    )
    if active is None:
        return None
    return _serialize_break_glass(
        active,
        org_slug=active.organization.slug if active.organization else "unknown",
        repo_slug=active.repository.slug if active.repository else "unknown",
        actor_email=verified_actor.email,
        actor_display_name=verified_actor.display_name,
    )
