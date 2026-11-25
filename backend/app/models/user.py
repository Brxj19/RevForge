from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


def _derive_handle(email: str) -> str:
    """Derive a URL-safe handle from an email local-part."""
    local = email.split("@")[0].lower()
    cleaned = re.sub(r"[^a-z0-9-]", "-", local).strip("-")[:32] or "user"
    return f"{cleaned}-{uuid.uuid4().hex[:6]}"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    handle: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)

    def __init__(self, **kwargs: Any) -> None:
        if "handle" not in kwargs and "email" in kwargs:
            kwargs["handle"] = _derive_handle(kwargs["email"])
        super().__init__(**kwargs)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_platform_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    author_aliases: Mapped[list[Any] | None] = mapped_column(
        JSON, nullable=True, default=list, server_default="[]"
    )
    preferences: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True, default=dict, server_default="{}"
    )
    notification_settings: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True, default=dict, server_default="{}"
    )

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
    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    email_verification_tokens = relationship(
        "EmailVerificationToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    password_reset_tokens = relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
