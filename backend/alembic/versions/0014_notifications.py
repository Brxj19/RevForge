"""Create notifications table.

Revision ID: 0014_notifications
Revises: 0013_user_handle
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0014_notifications"
down_revision = "0013_user_handle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(30), nullable=True),
        sa.Column("href", sa.String(1000), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_notifications_user_read_created",
        "notifications",
        ["user_id", "is_read", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_read_created", table_name="notifications")
    op.drop_table("notifications")
