"""Add Phase 3 transport credentials for Mercurial HTTPS and SSH."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0004_phase3_secure_transport"
down_revision = "0003_phase2_mercurial_read_only"
branch_labels = None
depends_on = None

repository_role = postgresql.ENUM(
    "read",
    "write",
    "admin",
    name="repository_role",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "personal_access_tokens",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
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
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("token_digest", sa.String(length=128), nullable=False, unique=True),
        sa.Column("capability", repository_role, nullable=False),
        sa.Column(
            "organization_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "repository_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("repositories.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_personal_access_tokens_user_id",
        "personal_access_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_personal_access_tokens_token_prefix",
        "personal_access_tokens",
        ["token_prefix"],
        unique=False,
    )

    op.create_table(
        "ssh_public_keys",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
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
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key_type", sa.String(length=64), nullable=False),
        sa.Column("public_key_normalized", sa.String(length=2048), nullable=False),
        sa.Column("fingerprint_sha256", sa.String(length=128), nullable=False, unique=True),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ssh_public_keys_user_id", "ssh_public_keys", ["user_id"], unique=False)
    op.create_index(
        "ix_ssh_public_keys_fingerprint_sha256",
        "ssh_public_keys",
        ["fingerprint_sha256"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ssh_public_keys_fingerprint_sha256", table_name="ssh_public_keys")
    op.drop_index("ix_ssh_public_keys_user_id", table_name="ssh_public_keys")
    op.drop_table("ssh_public_keys")
    op.drop_index("ix_personal_access_tokens_token_prefix", table_name="personal_access_tokens")
    op.drop_index("ix_personal_access_tokens_user_id", table_name="personal_access_tokens")
    op.drop_table("personal_access_tokens")
