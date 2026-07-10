"""Add missing server_default to timestamp and boolean columns

Revision ID: 0006_fix_missing_server_defaults
Revises: f4247ddf53c2
Create Date: 2026-07-10

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0006_fix_missing_server_defaults"
down_revision: str | None = "f4247ddf53c2"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.alter_column(
        "repository_events",
        "created_at",
        server_default=sa.text("now()"),
        type_=sa.DateTime(timezone=True),
        nullable=False,
        existing_server_default=None,
    )
    op.alter_column(
        "repository_events",
        "updated_at",
        server_default=sa.text("now()"),
        type_=sa.DateTime(timezone=True),
        nullable=False,
        existing_server_default=None,
    )
    op.alter_column(
        "event_spool",
        "created_at",
        server_default=sa.text("now()"),
        type_=sa.DateTime(timezone=True),
        nullable=False,
        existing_server_default=None,
    )
    op.alter_column(
        "webhooks",
        "created_at",
        server_default=sa.text("now()"),
        type_=sa.DateTime(timezone=True),
        nullable=False,
        existing_server_default=None,
    )
    op.alter_column(
        "webhooks",
        "updated_at",
        server_default=sa.text("now()"),
        type_=sa.DateTime(timezone=True),
        nullable=False,
        existing_server_default=None,
    )
    op.alter_column(
        "webhook_deliveries",
        "created_at",
        server_default=sa.text("now()"),
        type_=sa.DateTime(timezone=True),
        nullable=False,
        existing_server_default=None,
    )
    op.alter_column(
        "pull_request_comments",
        "outdated",
        server_default=sa.text("false"),
        nullable=False,
        existing_server_default=None,
    )


def downgrade() -> None:
    op.alter_column(
        "pull_request_comments",
        "outdated",
        server_default=None,
        nullable=False,
    )
    op.alter_column(
        "webhook_deliveries",
        "created_at",
        server_default=None,
        type_=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "webhooks",
        "updated_at",
        server_default=None,
        type_=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "webhooks",
        "created_at",
        server_default=None,
        type_=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "event_spool",
        "created_at",
        server_default=None,
        type_=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "repository_events",
        "updated_at",
        server_default=None,
        type_=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "repository_events",
        "created_at",
        server_default=None,
        type_=sa.DateTime(timezone=True),
        nullable=False,
    )
