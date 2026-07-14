from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RepositoryEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "repository_events"

    repository_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    actor_user_id: Mapped[UUIDType | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    authentication_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    credential_id: Mapped[UUIDType | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    actor_user = relationship("User")


class EventSpoolEntry(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "event_spool"

    repository_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    idempotency_key: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_for: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
