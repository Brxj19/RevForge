"""Add user settings columns: author_aliases, preferences, notification_settings.

Revision ID: 0011_user_settings
Revises: 0010_pr_number_unique
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0011_user_settings"
down_revision = "0010_pr_number_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("author_aliases", sa.JSON(), nullable=True, server_default="[]"),
        )
        batch.add_column(
            sa.Column("preferences", sa.JSON(), nullable=True, server_default="{}"),
        )
        batch.add_column(
            sa.Column("notification_settings", sa.JSON(), nullable=True, server_default="{}"),
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("notification_settings")
        batch.drop_column("preferences")
        batch.drop_column("author_aliases")
