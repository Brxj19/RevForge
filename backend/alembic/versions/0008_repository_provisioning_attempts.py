"""Track repository provisioning attempts (I36).

Revision ID: 0008_provisioning_attempts
Revises: 0007_pr_review_unique
Create Date: 2026-10-09

Adds ``provisioning_started_at`` and ``provisioning_attempt_id`` so a repository stuck in
PROVISIONING (crashed or cancelled request) can be detected as stale and reclaimed, and so
only the attempt that started provisioning may write its final state. Both columns are
nullable with no backfill, so the upgrade is a metadata-only change on PostgreSQL.

Rows already stuck in PROVISIONING have a NULL start time; the worker sweeper and the
provision endpoint treat those as stale. Downgrade drops the columns and index; the only
data lost is in-flight attempt bookkeeping.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0008_provisioning_attempts"
down_revision = "0007_pr_review_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "repositories",
        sa.Column("provisioning_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "repositories",
        sa.Column("provisioning_attempt_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_repositories_provisioning_state_started_at",
        "repositories",
        ["provisioning_state", "provisioning_started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_repositories_provisioning_state_started_at", table_name="repositories")
    op.drop_column("repositories", "provisioning_attempt_id")
    op.drop_column("repositories", "provisioning_started_at")
