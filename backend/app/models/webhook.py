from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Webhook(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "webhooks"
    __table_args__ = (UniqueConstraint("repository_id", "url"),)

    repository_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    secret: Mapped[str] = mapped_column(String(128), nullable=False)
    event_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_by_user_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )


class WebhookDelivery(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "webhook_deliveries"

    webhook_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("webhooks.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    request_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    request_headers_json: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    request_body_truncated: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body_truncated: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
