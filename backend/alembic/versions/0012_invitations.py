"""Create invitations table.

Revision ID: 0012_invitations
Revises: 0011_user_settings
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0012_invitations"
down_revision = "0011_user_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column(
            "role",
            sa.String(40),
            sa.CheckConstraint("role IN ('owner', 'admin', 'member')", name="ck_invitations_role"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(128), unique=True, nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            sa.CheckConstraint(
                "status IN ('pending', 'accepted', 'revoked', 'expired')",
                name="ck_invitations_status",
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "invited_by_user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "accepted_by_user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Partial unique index: one pending invitation per org+email.
    op.create_index(
        "uq_invitations_org_email_pending",
        "invitations",
        ["organization_id", "email"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_invitations_org_email_pending", table_name="invitations")
    op.drop_table("invitations")
