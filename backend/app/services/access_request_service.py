"""Access request lifecycle: create, list, approve, deny, withdraw."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import utc_now
from app.models.access_request import AccessRequest
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.services.audit import record_audit_event
from app.services.errors import ConflictError, NotFoundError
from app.services.notification_service import create_notification


async def create_access_request(
    session: AsyncSession,
    *,
    user: User,
    repository: Repository,
    role: str,
    message: str | None,
    request_id: str | None = None,
) -> AccessRequest:
    """Create an access request. Only org members without access may request."""
    if role not in ("read", "write"):
        raise ConflictError("Role must be 'read' or 'write'.")

    # Check for existing pending request.
    existing = await session.scalar(
        select(AccessRequest).where(
            AccessRequest.user_id == user.id,
            AccessRequest.repository_id == repository.id,
            AccessRequest.status == "pending",
        )
    )
    if existing is not None:
        raise ConflictError("You already have a pending access request for this repository.")

    access_request = AccessRequest(
        user_id=user.id,
        repository_id=repository.id,
        role=role,
        message=message,
        status="pending",
        created_at=utc_now(),
    )
    session.add(access_request)
    await session.flush()

    await record_audit_event(
        session,
        event_type="access_request.created",
        actor_user_id=user.id,
        organization_id=repository.organization_id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={"role": role},
    )

    return access_request


async def list_pending_requests(
    session: AsyncSession,
    *,
    organization_id: UUID,
) -> list[AccessRequest]:
    """List pending access requests for all repos in an organization."""
    result = await session.execute(
        select(AccessRequest)
        .join(Repository, AccessRequest.repository_id == Repository.id)
        .where(
            Repository.organization_id == organization_id,
            AccessRequest.status == "pending",
        )
        .order_by(AccessRequest.created_at.desc())
    )
    return list(result.scalars())


async def approve_request(
    session: AsyncSession,
    *,
    request_id_val: UUID,
    organization_id: UUID,
    reviewer: User,
    http_request_id: str | None = None,
) -> AccessRequest:
    """Approve an access request: create permission, notify requester, audit event."""
    access_request = await _get_pending_request(session, request_id_val, organization_id)

    access_request.status = "approved"
    access_request.reviewed_by = reviewer.id
    access_request.reviewed_at = utc_now()

    # Create the repository permission.
    from app.domain.enums import RepositoryRole

    role_enum = RepositoryRole(access_request.role)
    existing_perm = await session.scalar(
        select(RepositoryPermission).where(
            RepositoryPermission.repository_id == access_request.repository_id,
            RepositoryPermission.user_id == access_request.user_id,
        )
    )
    if existing_perm is None:
        permission = RepositoryPermission(
            repository_id=access_request.repository_id,
            user_id=access_request.user_id,
            role=role_enum,
            granted_by_user_id=reviewer.id,
        )
        session.add(permission)
    else:
        existing_perm.role = role_enum
        existing_perm.granted_by_user_id = reviewer.id

    await session.flush()

    # Load repository for notification.
    repo = await session.get(Repository, access_request.repository_id)
    repo_slug = repo.slug if repo else "unknown"

    # Notify the requester.
    await create_notification(
        session,
        user_id=access_request.user_id,
        type="access_request",
        title=f"Your access request for {repo_slug} was approved",
        body=f"You now have {access_request.role} access.",
        icon="check",
        href=f"/{repo_slug}",
    )

    await record_audit_event(
        session,
        event_type="access_request.approved",
        actor_user_id=reviewer.id,
        organization_id=organization_id,
        repository_id=access_request.repository_id,
        request_id=http_request_id,
        metadata_json={
            "user_id": str(access_request.user_id),
            "role": access_request.role,
        },
    )

    return access_request


async def deny_request(
    session: AsyncSession,
    *,
    request_id_val: UUID,
    organization_id: UUID,
    reviewer: User,
    http_request_id: str | None = None,
) -> AccessRequest:
    """Deny an access request: notify requester, audit event."""
    access_request = await _get_pending_request(session, request_id_val, organization_id)

    access_request.status = "denied"
    access_request.reviewed_by = reviewer.id
    access_request.reviewed_at = utc_now()

    # Load repository for notification.
    repo = await session.get(Repository, access_request.repository_id)
    repo_slug = repo.slug if repo else "unknown"

    # Notify the requester.
    await create_notification(
        session,
        user_id=access_request.user_id,
        type="access_request",
        title=f"Your access request for {repo_slug} was denied",
        icon="x",
    )

    await record_audit_event(
        session,
        event_type="access_request.denied",
        actor_user_id=reviewer.id,
        organization_id=organization_id,
        repository_id=access_request.repository_id,
        request_id=http_request_id,
        metadata_json={
            "user_id": str(access_request.user_id),
            "role": access_request.role,
        },
    )

    return access_request


async def withdraw_request(
    session: AsyncSession,
    *,
    request_id_val: UUID,
    user: User,
    organization_id: UUID,
    request_id: str | None = None,
) -> None:
    """Withdraw own pending access request."""
    access_request = await session.scalar(
        select(AccessRequest)
        .join(Repository, AccessRequest.repository_id == Repository.id)
        .where(
            AccessRequest.id == request_id_val,
            Repository.organization_id == organization_id,
            AccessRequest.user_id == user.id,
            AccessRequest.status == "pending",
        )
    )
    if access_request is None:
        raise NotFoundError("Access request not found or not withdrawable.")

    access_request.status = "withdrawn"
    access_request.reviewed_at = utc_now()

    await record_audit_event(
        session,
        event_type="access_request.withdrawn",
        actor_user_id=user.id,
        organization_id=organization_id,
        repository_id=access_request.repository_id,
        request_id=request_id,
    )


async def _get_pending_request(
    session: AsyncSession,
    request_id_val: UUID,
    organization_id: UUID,
) -> AccessRequest:
    """Load a pending access request scoped to the organization."""
    access_request = await session.scalar(
        select(AccessRequest)
        .join(Repository, AccessRequest.repository_id == Repository.id)
        .where(
            AccessRequest.id == request_id_val,
            Repository.organization_id == organization_id,
            AccessRequest.status == "pending",
        )
    )
    if access_request is None:
        raise NotFoundError("Access request not found.")
    return access_request
