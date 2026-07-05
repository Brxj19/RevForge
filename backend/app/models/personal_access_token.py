from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import enum_values
from app.domain.enums import RepositoryRole


class PersonalAccessToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "personal_access_tokens"

    user_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    token_digest: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    capability: Mapped[RepositoryRole] = mapped_column(
        Enum(
            RepositoryRole,
            name="personal_access_token_capability",
            values_callable=enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    organization_id: Mapped[UUIDType | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
    )
    repository_id: Mapped[UUIDType | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=True,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="personal_access_tokens")
    organization = relationship("Organization")
    repository = relationship("Repository")
