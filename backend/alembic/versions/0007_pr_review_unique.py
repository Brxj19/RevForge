"""Add unique constraint on pull request reviews (one per reviewer).

Revision ID: 0007_pr_review_unique
Revises: 0006_fix_missing_server_defaults
Create Date: 2026-10-04

Enforces audit C16: one review row per (pull_request_id, reviewer_id) so
approval counts cannot be inflated by repeated submissions.
"""

from __future__ import annotations

from alembic import op

revision = "0007_pr_review_unique"
down_revision = "0006_fix_missing_server_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing DBs may already have multiple review rows per (pr, reviewer) from the
    # pre-fix insert-always behavior; keep only the latest before adding the
    # constraint, or create_unique_constraint would fail (audit C16 migration safety).
    op.execute(
        """
        DELETE FROM pull_request_reviews
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY pull_request_id, reviewer_id
                    ORDER BY created_at DESC, id DESC
                ) AS rn
                FROM pull_request_reviews
            ) ranked
            WHERE ranked.rn > 1
        )
        """
    )
    op.create_unique_constraint(
        "uq_pull_request_reviews_pr_reviewer",
        "pull_request_reviews",
        ["pull_request_id", "reviewer_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_pull_request_reviews_pr_reviewer",
        "pull_request_reviews",
        type_="unique",
    )
