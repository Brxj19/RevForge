"""Create access_requests table.

Revision ID: 0015_access_requests
Revises: 0014_notifications
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0015_access_requests"
down_revision = "0014_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "access_requests",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "repository_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("repositories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.String(20),
            sa.CheckConstraint("role IN ('read', 'write')", name="ck_access_requests_role"),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            sa.CheckConstraint(
                "status IN ('pending', 'approved', 'denied', 'withdrawn')",
                name="ck_access_requests_status",
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "reviewed_by",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Partial unique index: one pending request per user+repository.
    op.create_index(
        "uq_access_requests_user_repo_pending",
        "access_requests",
        ["user_id", "repository_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_access_requests_user_repo_pending", table_name="access_requests")
    op.drop_table("access_requests")
