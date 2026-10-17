"""Add resolved column to PR comments and viewed-files table.

Revision ID: 0009_pr_comment_resolved_and_viewed_files
Revises: 0008_provisioning_attempts
Create Date: 2026-10-17

Adds ``resolved`` (boolean, default false) to ``pull_request_comments`` for
comment thread resolution.

Creates ``pull_request_viewed_files`` to track which diff files a user has
marked as viewed on a pull request.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0009_pr_comment_resolved_and_viewed_files"
down_revision = "0008_provisioning_attempts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- resolved column on comments --
    op.add_column(
        "pull_request_comments",
        sa.Column(
            "resolved",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )

    # -- viewed files table --
    op.create_table(
        "pull_request_viewed_files",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pull_request_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.ForeignKeyConstraint(
            ["pull_request_id"],
            ["pull_requests.id"],
            name=op.f("fk_pull_request_viewed_files_pull_request_id_pull_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_pull_request_viewed_files_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pull_request_viewed_files")),
        sa.UniqueConstraint(
            "pull_request_id",
            "user_id",
            "path",
            name="uq_pull_request_viewed_files_pr_user_path",
        ),
    )
    op.create_index(
        op.f("ix_pull_request_viewed_files_pull_request_id"),
        "pull_request_viewed_files",
        ["pull_request_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_pull_request_viewed_files_pull_request_id"),
        table_name="pull_request_viewed_files",
    )
    op.drop_table("pull_request_viewed_files")
    op.drop_column("pull_request_comments", "resolved")
