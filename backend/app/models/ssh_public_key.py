from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SshPublicKey(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ssh_public_keys"

    user_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    key_type: Mapped[str] = mapped_column(String(64), nullable=False)
    public_key_normalized: Mapped[str] = mapped_column(String(2048), nullable=False)
    fingerprint_sha256: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="ssh_public_keys")
