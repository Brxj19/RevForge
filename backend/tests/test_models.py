from __future__ import annotations

from sqlalchemy import UniqueConstraint

from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.user import User


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


def test_repository_slug_is_unique_within_organization() -> None:
    unique_constraints = _unique_constraint_columns(Repository)
    assert ("organization_id", "slug") in unique_constraints
