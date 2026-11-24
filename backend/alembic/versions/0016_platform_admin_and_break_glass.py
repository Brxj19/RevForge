"""Add platform admin, user suspension, audit severity, and break-glass sessions.

Revision ID: 0016_platform_admin_and_break_glass
Revises: 0015_access_requests
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0016_platform_admin_and_break_glass"
down_revision = "0015_access_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_platform_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("suspended_reason", sa.String(length=500), nullable=True),
    )

    op.add_column(
        "audit_events",
        sa.Column(
            "severity",
            sa.String(length=16),
            nullable=False,
            server_default="normal",
        ),
    )
    op.create_index("ix_audit_events_severity", "audit_events", ["severity"])

    op.create_table(
        "break_glass_sessions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "actor_user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "repository_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("repositories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "revoked_by_user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("request_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_break_glass_sessions_actor_user_id",
        "break_glass_sessions",
        ["actor_user_id"],
    )
    op.create_index(
        "ix_break_glass_sessions_organization_id",
        "break_glass_sessions",
        ["organization_id"],
    )
    op.create_index(
        "ix_break_glass_sessions_repository_id",
        "break_glass_sessions",
        ["repository_id"],
    )
    op.create_index(
        "ix_break_glass_sessions_expires_at",
        "break_glass_sessions",
        ["expires_at"],
    )
    op.create_index(
        "ix_break_glass_sessions_actor_repo_expires",
        "break_glass_sessions",
        ["actor_user_id", "repository_id", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_break_glass_sessions_actor_repo_expires", table_name="break_glass_sessions")
    op.drop_index("ix_break_glass_sessions_expires_at", table_name="break_glass_sessions")
    op.drop_index("ix_break_glass_sessions_repository_id", table_name="break_glass_sessions")
    op.drop_index("ix_break_glass_sessions_organization_id", table_name="break_glass_sessions")
    op.drop_index("ix_break_glass_sessions_actor_user_id", table_name="break_glass_sessions")
    op.drop_table("break_glass_sessions")

    op.drop_index("ix_audit_events_severity", table_name="audit_events")
    op.drop_column("audit_events", "severity")

    op.drop_column("users", "suspended_reason")
    op.drop_column("users", "suspended_at")
    op.drop_column("users", "is_platform_admin")
