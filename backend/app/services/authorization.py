from __future__ import annotations

from dataclasses import dataclass

from app.domain.enums import OrganizationRole, RepositoryRole, RepositoryVisibility
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User


@dataclass(slots=True)
class RepositoryAccess:
    viewer_role: RepositoryRole | None
    can_read: bool
    can_manage: bool
    inherited_access: bool


def is_organization_manager(role: OrganizationRole) -> bool:
    return role in {OrganizationRole.OWNER, OrganizationRole.ADMIN}


def can_manage_owner_memberships(actor_role: OrganizationRole) -> bool:
    return actor_role == OrganizationRole.OWNER


def organization_can_view(
    actor: User | None,
    membership: OrganizationMember | None,
) -> bool:
    return actor is not None and membership is not None and actor.is_active


def organization_can_manage(membership: OrganizationMember | None) -> bool:
    return membership is not None and is_organization_manager(membership.role)


def repository_access_for_actor(
    actor: User | None,
    organization_membership: OrganizationMember | None,
    repository: Repository,
    explicit_permission: RepositoryPermission | None,
) -> RepositoryAccess:
    if organization_membership is not None and organization_membership.role in {
        OrganizationRole.OWNER,
        OrganizationRole.ADMIN,
    }:
        return RepositoryAccess(
            viewer_role=RepositoryRole.ADMIN,
            can_read=True,
            can_manage=True,
            inherited_access=True,
        )

    if explicit_permission is not None and organization_membership is not None:
        return RepositoryAccess(
            viewer_role=explicit_permission.role,
            can_read=True,
            can_manage=explicit_permission.role == RepositoryRole.ADMIN,
            inherited_access=False,
        )

    if repository.visibility == RepositoryVisibility.PUBLIC:
        return RepositoryAccess(
            viewer_role=RepositoryRole.READ if actor is not None else None,
            can_read=True,
            can_manage=False,
            inherited_access=True,
        )

    if (
        repository.visibility == RepositoryVisibility.INTERNAL
        and actor is not None
        and organization_membership is not None
    ):
        return RepositoryAccess(
            viewer_role=RepositoryRole.READ,
            can_read=True,
            can_manage=False,
            inherited_access=True,
        )

    return RepositoryAccess(
        viewer_role=None, can_read=False, can_manage=False, inherited_access=False
    )
