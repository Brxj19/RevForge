"""Enforce repository-scoped pull request numbers.

Revision ID: 0010_pr_number_unique
Revises: 0009_pr_comment_resolved_and_viewed_files
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0010_pr_number_unique"
down_revision = "0009_pr_comment_resolved_and_viewed_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    duplicate = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT 1 FROM pull_requests GROUP BY repository_id, number "
                "HAVING COUNT(*) > 1 LIMIT 1"
            )
        )
        .first()
    )
    if duplicate:
        raise RuntimeError(
            "Duplicate pull request numbers exist; resolve them with an administrator "
            "before applying migration 0010. No numbers were changed."
        )
    with op.batch_alter_table("pull_requests") as batch:
        batch.create_unique_constraint("uq_pull_requests_repo_number", ["repository_id", "number"])


def downgrade() -> None:
    with op.batch_alter_table("pull_requests") as batch:
        batch.drop_constraint("uq_pull_requests_repo_number", type_="unique")
