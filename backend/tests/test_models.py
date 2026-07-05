from __future__ import annotations

from sqlalchemy import UniqueConstraint

from app.models.audit_event import AuditEvent
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.models.user_password_credential import UserPasswordCredential
from app.models.user_session import UserSession


def _unique_constraint_columns(model) -> set[tuple[str, ...]]:
    return {
        tuple(constraint.columns.keys())
        for constraint in model.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def test_user_email_is_unique() -> None:
    assert User.__table__.c.email.unique is True


def test_organization_slug_is_unique() -> None:
    assert Organization.__table__.c.slug.unique is True


def test_membership_is_unique_per_user_and_organization() -> None:
    unique_constraints = _unique_constraint_columns(OrganizationMember)
    assert ("organization_id", "user_id") in unique_constraints


def test_postgresql_enum_columns_persist_lowercase_values() -> None:
    assert OrganizationMember.__table__.c.role.type.enums == ["owner", "admin", "member"]
    assert Repository.__table__.c.visibility.type.enums == ["public", "internal", "private"]
    assert RepositoryPermission.__table__.c.role.type.enums == ["read", "write", "admin"]


def test_repository_slug_is_unique_within_organization() -> None:
    unique_constraints = _unique_constraint_columns(Repository)
    assert ("organization_id", "slug") in unique_constraints


def test_repository_permission_is_unique_per_user_and_repository() -> None:
    unique_constraints = _unique_constraint_columns(RepositoryPermission)
    assert ("repository_id", "user_id") in unique_constraints


def test_user_password_credential_is_unique_per_user() -> None:
    unique_constraints = _unique_constraint_columns(UserPasswordCredential)
    assert ("user_id",) in unique_constraints


def test_repository_schema_does_not_include_filesystem_path() -> None:
    assert "filesystem_path" not in Repository.__table__.columns.keys()


def test_user_session_uses_token_digest_column() -> None:
    assert "token_digest" in UserSession.__table__.columns.keys()


def test_audit_event_uses_structured_metadata() -> None:
    assert "metadata_json" in AuditEvent.__table__.columns.keys()
