"""Add Phase 1 control-plane schema."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0002_phase1_control_plane"
down_revision = "0001_phase0_foundation"
branch_labels = None
depends_on = None

repository_role = postgresql.ENUM("read", "write", "admin", name="repository_role")


def upgrade() -> None:
    op.execute("ALTER TYPE organization_role ADD VALUE IF NOT EXISTS 'owner'")
    op.execute("ALTER TYPE repository_visibility ADD VALUE IF NOT EXISTS 'internal'")

    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.add_column("organizations", sa.Column("description", sa.Text(), nullable=True))

    op.add_column(
        "organization_members",
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    op.add_column("repositories", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "repositories",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "repositories", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_repositories_created_by_user_id_users",
        "repositories",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute(
        """
        UPDATE repositories AS r
        SET created_by_user_id = owner_members.user_id
        FROM (
            SELECT DISTINCT ON (organization_id) organization_id, user_id
            FROM organization_members
            ORDER BY organization_id, created_at ASC
        ) AS owner_members
        WHERE r.organization_id = owner_members.organization_id
          AND r.created_by_user_id IS NULL
        """
    )
    op.alter_column("repositories", "created_by_user_id", nullable=False)

    repository_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "user_password_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", name="uq_user_password_credentials_user_id"),
    )

    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_digest", sa.String(length=128), nullable=False),
        sa.Column("csrf_token", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token_digest", name="uq_user_sessions_token_digest"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False)
    op.create_index(
        "ix_user_sessions_token_digest", "user_sessions", ["token_digest"], unique=False
    )

    op.create_table(
        "repository_permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "repository_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repositories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            postgresql.ENUM(
                "read",
                "write",
                "admin",
                name="repository_role",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "granted_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "repository_id",
            "user_id",
            name="uq_repository_permissions_repository_id_user_id",
        ),
    )

    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "repository_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repositories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_table("repository_permissions")
    op.drop_index("ix_user_sessions_token_digest", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_table("user_password_credentials")

    op.drop_constraint(
        "fk_repositories_created_by_user_id_users", "repositories", type_="foreignkey"
    )
    op.drop_column("repositories", "archived_at")
    op.drop_column("repositories", "created_by_user_id")
    op.drop_column("repositories", "description")
    op.drop_column("organization_members", "updated_at")
    op.drop_column("organizations", "description")
    op.drop_column("users", "is_active")

    repository_role.drop(op.get_bind(), checkfirst=True)
