from __future__ import annotations

from uuid import UUID as UUIDType

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserPasswordCredential(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_password_credentials"
    __table_args__ = (UniqueConstraint("user_id"),)

    user_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)

    user = relationship("User", back_populates="password_credential")
