from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import enum_values
from app.domain.enums import RepositoryProvisioningState, RepositoryVisibility


class Repository(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "repositories"
    __table_args__ = (
        UniqueConstraint("organization_id", "slug"),
        # Stale-provisioning sweeps filter on state + start time (I36).
        Index(
            "ix_repositories_provisioning_state_started_at",
            "provisioning_state",
            "provisioning_started_at",
        ),
    )

    organization_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[RepositoryVisibility] = mapped_column(
        Enum(
            RepositoryVisibility,
            name="repository_visibility",
            values_callable=enum_values,
            validate_strings=True,
        ),
        default=RepositoryVisibility.PRIVATE,
        nullable=False,
    )
    provisioning_state: Mapped[RepositoryProvisioningState] = mapped_column(
        Enum(
            RepositoryProvisioningState,
            name="repository_provisioning_state",
            values_callable=enum_values,
            validate_strings=True,
        ),
        default=RepositoryProvisioningState.UNPROVISIONED,
        nullable=False,
    )
    provisioned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provisioning_error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Set when an attempt starts; cleared when it finishes. Lets a stuck PROVISIONING row
    # be recognised as stale and reclaimed (I36).
    provisioning_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Identifies the attempt allowed to write the final state (compare-and-set).
    provisioning_attempt_id: Mapped[UUIDType | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True
    )
    created_by_user_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="repositories")
    created_by_user = relationship("User")
    permissions = relationship(
        "RepositoryPermission",
        back_populates="repository",
        cascade="all, delete-orphan",
    )
