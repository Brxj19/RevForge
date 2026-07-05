from __future__ import annotations

from uuid import UUID as UUIDType

from sqlalchemy import Enum, ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import enum_values
from app.domain.enums import RepositoryRole


class RepositoryPermission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "repository_permissions"
    __table_args__ = (UniqueConstraint("repository_id", "user_id"),)

    repository_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[RepositoryRole] = mapped_column(
        Enum(
            RepositoryRole,
            name="repository_role",
            values_callable=enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    granted_by_user_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    repository = relationship("Repository", back_populates="permissions")
    user = relationship("User", back_populates="repository_permissions", foreign_keys=[user_id])
    granted_by_user = relationship(
        "User",
        back_populates="granted_repository_permissions",
        foreign_keys=[granted_by_user_id],
    )
