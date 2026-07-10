"""Phase 7: pull requests and review workflow"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "f4247ddf53c2"
down_revision = "0005_phase6_events_and_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pull_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "state",
            sa.Enum("open", "draft", "merged", "closed", name="pull_request_state"),
            nullable=False,
        ),
        sa.Column("source_revision", sa.String(40), nullable=False),
        sa.Column("target_revision", sa.String(40), nullable=False),
        sa.Column("source_branch", sa.String(200), nullable=True),
        sa.Column("target_branch", sa.String(200), nullable=True),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("merger_id", sa.Uuid(), nullable=True),
        sa.Column("merged_revision", sa.String(40), nullable=True),
        sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_pull_requests_author_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["merger_id"],
            ["users.id"],
            name=op.f("fk_pull_requests_merger_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["repository_id"],
            ["repositories.id"],
            name=op.f("fk_pull_requests_repository_id_repositories"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pull_requests")),
    )
    op.create_index(
        op.f("ix_pull_requests_number"), "pull_requests", ["number"], unique=False
    )
    op.create_index(
        op.f("ix_pull_requests_repository_id"),
        "pull_requests",
        ["repository_id"],
        unique=False,
    )
    op.create_table(
        "pull_request_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pull_request_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("reply_to_comment_id", sa.Uuid(), nullable=True),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("line_number", sa.Integer(), nullable=True),
        sa.Column("base_revision", sa.String(40), nullable=True),
        sa.Column("head_revision", sa.String(40), nullable=True),
        sa.Column("outdated", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_pull_request_comments_author_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pull_request_id"],
            ["pull_requests.id"],
            name=op.f("fk_pull_request_comments_pull_request_id_pull_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reply_to_comment_id"],
            ["pull_request_comments.id"],
            name=op.f(
                "fk_pull_request_comments_reply_to_comment_id_pull_request_comments"
            ),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pull_request_comments")),
    )
    op.create_index(
        op.f("ix_pull_request_comments_pull_request_id"),
        "pull_request_comments",
        ["pull_request_id"],
        unique=False,
    )
    op.create_table(
        "pull_request_reviewers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pull_request_id", sa.Uuid(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["pull_request_id"],
            ["pull_requests.id"],
            name=op.f("fk_pull_request_reviewers_pull_request_id_pull_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"],
            ["users.id"],
            name=op.f("fk_pull_request_reviewers_reviewer_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pull_request_reviewers")),
    )
    op.create_index(
        op.f("ix_pull_request_reviewers_pull_request_id"),
        "pull_request_reviewers",
        ["pull_request_id"],
        unique=False,
    )
    op.create_table(
        "pull_request_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pull_request_id", sa.Uuid(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=False),
        sa.Column(
            "decision",
            sa.Enum(
                "approved", "changes_requested", "comment", name="review_decision"
            ),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["pull_request_id"],
            ["pull_requests.id"],
            name=op.f("fk_pull_request_reviews_pull_request_id_pull_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"],
            ["users.id"],
            name=op.f("fk_pull_request_reviews_reviewer_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pull_request_reviews")),
    )
    op.create_index(
        op.f("ix_pull_request_reviews_pull_request_id"),
        "pull_request_reviews",
        ["pull_request_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_pull_request_reviews_pull_request_id"),
        table_name="pull_request_reviews",
    )
    op.drop_table("pull_request_reviews")
    op.drop_index(
        op.f("ix_pull_request_reviewers_pull_request_id"),
        table_name="pull_request_reviewers",
    )
    op.drop_table("pull_request_reviewers")
    op.drop_index(
        op.f("ix_pull_request_comments_pull_request_id"),
        table_name="pull_request_comments",
    )
    op.drop_table("pull_request_comments")
    op.drop_index(
        op.f("ix_pull_requests_repository_id"), table_name="pull_requests"
    )
    op.drop_index(op.f("ix_pull_requests_number"), table_name="pull_requests")
    op.drop_table("pull_requests")