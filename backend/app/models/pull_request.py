from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import enum_values
from app.domain.enums import PullRequestState, ReviewDecision


class PullRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pull_requests"

    repository_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    number: Mapped[int] = mapped_column(nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[PullRequestState] = mapped_column(
        Enum(
            PullRequestState,
            name="pull_request_state",
            values_callable=enum_values,
            validate_strings=True,
        ),
        default=PullRequestState.OPEN,
        nullable=False,
    )
    source_revision: Mapped[str] = mapped_column(String(40), nullable=False)
    target_revision: Mapped[str] = mapped_column(String(40), nullable=False)
    source_branch: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_branch: Mapped[str | None] = mapped_column(String(200), nullable=True)
    author_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    merger_id: Mapped[UUIDType | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    merged_revision: Mapped[str | None] = mapped_column(String(40), nullable=True)
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    repository = relationship("Repository")
    author = relationship("User", foreign_keys=[author_id])
    merger = relationship("User", foreign_keys=[merger_id])
    comments = relationship(
        "PullRequestComment",
        back_populates="pull_request",
        cascade="all, delete-orphan",
        order_by="PullRequestComment.created_at",
    )
    reviewers = relationship(
        "PullRequestReviewer",
        back_populates="pull_request",
        cascade="all, delete-orphan",
    )
    reviews = relationship(
        "PullRequestReview",
        back_populates="pull_request",
        cascade="all, delete-orphan",
        order_by="PullRequestReview.created_at",
    )


class PullRequestComment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pull_request_comments"

    pull_request_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pull_requests.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    author_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_comment_id: Mapped[UUIDType | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pull_request_comments.id", ondelete="SET NULL"),
        nullable=True,
    )
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    line_number: Mapped[int | None] = mapped_column(nullable=True)
    base_revision: Mapped[str | None] = mapped_column(String(40), nullable=True)
    head_revision: Mapped[str | None] = mapped_column(String(40), nullable=True)
    outdated: Mapped[bool] = mapped_column(default=False, nullable=False)

    pull_request = relationship("PullRequest", back_populates="comments")
    author = relationship("User")


class PullRequestReviewer(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "pull_request_reviewers"

    pull_request_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pull_requests.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    reviewer_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    required: Mapped[bool] = mapped_column(default=True, nullable=False)

    pull_request = relationship("PullRequest", back_populates="reviewers")
    reviewer = relationship("User")


class PullRequestReview(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pull_request_reviews"

    pull_request_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pull_requests.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    reviewer_id: Mapped[UUIDType] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    decision: Mapped[ReviewDecision] = mapped_column(
        Enum(
            ReviewDecision,
            name="review_decision",
            values_callable=enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    pull_request = relationship("PullRequest", back_populates="reviews")
    reviewer = relationship("User")