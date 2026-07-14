from __future__ import annotations

import shutil
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import normalize_optional_text, validate_display_name, validate_slug
from app.domain.enums import (
    RepositoryProvisioningState,
    RepositoryRole,
    RepositoryVisibility,
)
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.repositories.organizations import get_membership, get_organization_by_slug
from app.repositories.repositories import (
    get_permission,
    get_repository_by_slug,
    list_permissions_for_repository,
)
from app.services.audit import record_audit_event
from app.services.authorization import organization_can_manage, repository_access_for_actor
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.services.user_resolution import resolve_active_user_by_identifier


async def get_organization_by_slug_for_repo_routes(
    session: AsyncSession,
    *,
    organization_slug: str,
) -> Organization:
    organization = await get_organization_by_slug(session, slug=validate_slug(organization_slug))
    if organization is None:
        raise NotFoundError("Organization not found.")
    return organization


async def list_visible_repositories(
    session: AsyncSession,
    *,
    organization: Organization,
    actor: User | None,
    include_archived: bool,
) -> list[tuple[Repository, RepositoryRole | None, bool, bool]]:
    membership = None
    if actor is not None:
        membership = await get_membership(
            session, organization_id=organization.id, user_id=actor.id
        )

    result = await session.execute(
        select(Repository)
        .where(Repository.organization_id == organization.id)
        .order_by(Repository.created_at.asc())
    )
    repositories = list(result.scalars())

    permissions_by_repo: dict[UUID, RepositoryPermission | None] = {}
    if actor is not None:
        rows = await session.execute(
            select(RepositoryPermission).where(
                RepositoryPermission.repository_id.in_([r.id for r in repositories]),
                RepositoryPermission.user_id == actor.id,
            )
        )
        for perm in rows.scalars():
            permissions_by_repo[perm.repository_id] = perm

    visible: list[tuple[Repository, RepositoryRole | None, bool, bool]] = []

    for repository in repositories:
        if repository.archived_at is not None and not include_archived:
            continue
        explicit_permission = permissions_by_repo.get(repository.id)
        access = repository_access_for_actor(actor, membership, repository, explicit_permission)
        if access.can_read:
            visible.append(
                (repository, access.viewer_role, access.can_manage, access.inherited_access)
            )

    return visible


async def create_repository(
    session: AsyncSession,
    *,
    organization: Organization,
    actor: User,
    actor_membership: OrganizationMember,
    slug: str,
    display_name: str,
    description: str | None,
    visibility: RepositoryVisibility,
    request_id: str | None,
) -> Repository:
    if not organization_can_manage(actor_membership):
        raise ForbiddenError("You do not have permission to create repositories.")

    try:
        normalized_slug = validate_slug(slug)
        normalized_name = validate_display_name(display_name)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    existing = await get_repository_by_slug(
        session, organization_id=organization.id, slug=normalized_slug
    )
    if existing is not None:
        raise ConflictError("Repository slug is already in use for this organization.")

    repository = Repository(
        organization_id=organization.id,
        slug=normalized_slug,
        display_name=normalized_name,
        description=normalize_optional_text(description),
        visibility=visibility,
        created_by_user_id=actor.id,
    )
    session.add(repository)
    await session.flush()

    await record_audit_event(
        session,
        event_type="repository.created",
        actor_user_id=actor.id,
        organization_id=organization.id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={"repository_slug": repository.slug, "visibility": visibility.value},
    )
    await session.commit()
    await session.refresh(repository)
    return repository


async def get_repository_for_actor(
    session: AsyncSession,
    *,
    organization: Organization,
    repository_slug: str,
    actor: User | None,
    allow_archived: bool = False,
) -> tuple[Repository, RepositoryRole | None, bool, bool]:
    repository = await get_repository_by_slug(
        session,
        organization_id=organization.id,
        slug=validate_slug(repository_slug),
    )
    if repository is None:
        raise NotFoundError("Repository not found.")

    membership = None
    explicit_permission = None
    if actor is not None:
        membership = await get_membership(
            session, organization_id=organization.id, user_id=actor.id
        )
        explicit_permission = await get_permission(
            session, repository_id=repository.id, user_id=actor.id
        )

    access = repository_access_for_actor(actor, membership, repository, explicit_permission)
    if not access.can_read:
        raise NotFoundError("Repository not found.")
    if repository.archived_at is not None and not allow_archived:
        raise NotFoundError("Repository not found.")

    return repository, access.viewer_role, access.can_manage, access.inherited_access


async def update_repository(
    session: AsyncSession,
    *,
    organization: Organization,
    repository: Repository,
    actor: User,
    actor_membership: OrganizationMember | None,
    actor_permission: RepositoryPermission | None,
    slug: str | None,
    display_name: str | None,
    description: str | None,
    visibility: RepositoryVisibility | None,
    archived: bool | None,
    request_id: str | None,
) -> Repository:
    access = repository_access_for_actor(actor, actor_membership, repository, actor_permission)
    if not access.can_manage:
        raise ForbiddenError("You do not have permission to update this repository.")
    if repository.archived_at is not None and archived is not False:
        raise ForbiddenError("Archived repositories must be unarchived before other updates.")

    event_type = "repository.updated"
    metadata_json: dict[str, object] = {"visibility": repository.visibility.value}

    if slug is not None:
        try:
            normalized_slug = validate_slug(slug)
        except ValueError as exc:
            raise ValidationFailure(str(exc)) from exc
        if normalized_slug != repository.slug:
            existing = await get_repository_by_slug(
                session, organization_id=organization.id, slug=normalized_slug
            )
            if existing is not None and existing.id != repository.id:
                raise ConflictError("Repository slug is already in use for this organization.")
            metadata_json["previous_slug"] = repository.slug
            metadata_json["new_slug"] = normalized_slug
            repository.slug = normalized_slug
            event_type = "repository.slug_renamed"

    if display_name is not None:
        try:
            repository.display_name = validate_display_name(display_name)
        except ValueError as exc:
            raise ValidationFailure(str(exc)) from exc
    if description is not None:
        repository.description = normalize_optional_text(description)
    if visibility is not None:
        repository.visibility = visibility

    if archived is True and repository.archived_at is None:
        from app.core.security import utc_now

        repository.archived_at = utc_now()
        event_type = "repository.archived"
    elif archived is False and repository.archived_at is not None:
        repository.archived_at = None
        event_type = "repository.unarchived"

    metadata_json["visibility"] = repository.visibility.value
    metadata_json["repository_slug"] = repository.slug

    await record_audit_event(
        session,
        event_type=event_type,
        actor_user_id=actor.id,
        organization_id=organization.id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json=metadata_json,
    )
    await session.commit()
    await session.refresh(repository)
    return repository


async def list_repository_permissions(
    session: AsyncSession,
    *,
    organization: Organization,
    repository: Repository,
    actor: User,
) -> list[RepositoryPermission]:
    membership = await get_membership(session, organization_id=organization.id, user_id=actor.id)
    explicit_permission = await get_permission(
        session, repository_id=repository.id, user_id=actor.id
    )
    access = repository_access_for_actor(actor, membership, repository, explicit_permission)
    if not access.can_manage:
        raise ForbiddenError("You do not have permission to manage repository permissions.")
    return await list_permissions_for_repository(session, repository_id=repository.id)


async def upsert_repository_permission(
    session: AsyncSession,
    *,
    organization: Organization,
    repository: Repository,
    actor: User,
    target_user_identifier: str,
    role: RepositoryRole,
    request_id: str | None,
) -> RepositoryPermission:
    membership = await get_membership(session, organization_id=organization.id, user_id=actor.id)
    actor_permission = await get_permission(session, repository_id=repository.id, user_id=actor.id)
    access = repository_access_for_actor(actor, membership, repository, actor_permission)
    if not access.can_manage:
        raise ForbiddenError("You do not have permission to manage repository permissions.")

    target_user = await resolve_active_user_by_identifier(
        session, identifier=target_user_identifier
    )
    target_membership = await get_membership(
        session,
        organization_id=organization.id,
        user_id=target_user.id,
    )
    if target_membership is None:
        raise ForbiddenError("Repository permissions require organization membership.")

    permission = await get_permission(session, repository_id=repository.id, user_id=target_user.id)
    event_type = "repository.permission_granted"
    if permission is None:
        permission = RepositoryPermission(
            repository_id=repository.id,
            user_id=target_user.id,
            role=role,
            granted_by_user_id=actor.id,
        )
        session.add(permission)
    else:
        permission.role = role
        permission.granted_by_user_id = actor.id
        event_type = "repository.permission_changed"

    await session.flush()
    await session.refresh(permission, attribute_names=["user"])

    await record_audit_event(
        session,
        event_type=event_type,
        actor_user_id=actor.id,
        organization_id=organization.id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={
            "user_display_name": target_user.display_name,
            "user_email": target_user.email,
            "role": role.value,
        },
    )
    await session.commit()
    permission = await session.scalar(
        select(RepositoryPermission)
        .options(selectinload(RepositoryPermission.user))
        .where(RepositoryPermission.id == permission.id)
    )
    if permission is None:
        raise RuntimeError("Failed to reload created permission.")
    return permission


async def delete_repository_permission(
    session: AsyncSession,
    *,
    organization: Organization,
    repository: Repository,
    actor: User,
    target_user_id: UUID,
    request_id: str | None,
) -> None:
    membership = await get_membership(session, organization_id=organization.id, user_id=actor.id)
    actor_permission = await get_permission(session, repository_id=repository.id, user_id=actor.id)
    access = repository_access_for_actor(actor, membership, repository, actor_permission)
    if not access.can_manage:
        raise ForbiddenError("You do not have permission to manage repository permissions.")

    permission = await get_permission(session, repository_id=repository.id, user_id=target_user_id)
    if permission is None:
        raise NotFoundError("Repository permission not found.")
    await session.refresh(permission, attribute_names=["user"])

    await record_audit_event(
        session,
        event_type="repository.permission_revoked",
        actor_user_id=actor.id,
        organization_id=organization.id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={
            "user_display_name": permission.user.display_name,
            "user_email": permission.user.email,
        },
    )
    await session.delete(permission)
    await session.commit()


async def delete_repository(
    session: AsyncSession,
    *,
    organization: Organization,
    repository: Repository,
    actor: User,
    actor_membership: OrganizationMember | None,
    actor_permission: RepositoryPermission | None,
    request_id: str | None,
    repository_path,
) -> None:
    access = repository_access_for_actor(actor, actor_membership, repository, actor_permission)
    if not access.can_manage:
        raise ForbiddenError("You do not have permission to delete this repository.")
    if repository.archived_at is None:
        raise ConflictError("Archive the repository before deleting it.")

    await record_audit_event(
        session,
        event_type="repository.deleted",
        actor_user_id=actor.id,
        organization_id=organization.id,
        repository_id=repository.id,
        request_id=request_id,
        metadata_json={"repository_slug": repository.slug},
    )
    await session.delete(repository)
    await session.commit()
    if repository_path.exists():
        shutil.rmtree(repository_path, ignore_errors=True)


def repository_is_browsable(repository: Repository) -> bool:
    return repository.provisioning_state == RepositoryProvisioningState.READY


def repository_phase_status(repository: Repository) -> str:
    match repository.provisioning_state:
        case RepositoryProvisioningState.UNPROVISIONED:
            return "Mercurial repository not provisioned yet."
        case RepositoryProvisioningState.PROVISIONING:
            return "Mercurial repository provisioning is in progress."
        case RepositoryProvisioningState.READY:
            return "Mercurial repository is provisioned and ready for browsing."
        case RepositoryProvisioningState.FAILED:
            return "Mercurial provisioning failed. Try provisioning again."
