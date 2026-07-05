from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    memberships = relationship(
        "OrganizationMember", back_populates="user", cascade="all, delete-orphan"
    )
    password_credential = relationship(
        "UserPasswordCredential",
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    personal_access_tokens = relationship(
        "PersonalAccessToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    ssh_public_keys = relationship(
        "SshPublicKey",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    granted_repository_permissions = relationship(
        "RepositoryPermission",
        back_populates="granted_by_user",
        foreign_keys="RepositoryPermission.granted_by_user_id",
    )
    repository_permissions = relationship(
        "RepositoryPermission",
        back_populates="user",
        foreign_keys="RepositoryPermission.user_id",
    )
