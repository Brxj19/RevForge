"""Add Phase 2 Mercurial provisioning metadata."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_phase2_mercurial_read_only"
down_revision = "0002_phase1_control_plane"
branch_labels = None
depends_on = None

repository_provisioning_state = postgresql.ENUM(
    "unprovisioned",
    "provisioning",
    "ready",
    "failed",
    name="repository_provisioning_state",
)


def upgrade() -> None:
    repository_provisioning_state.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "repositories",
        sa.Column(
            "provisioning_state",
            postgresql.ENUM(
                "unprovisioned",
                "provisioning",
                "ready",
                "failed",
                name="repository_provisioning_state",
                create_type=False,
            ),
            nullable=False,
            server_default="unprovisioned",
        ),
    )
    op.add_column(
        "repositories",
        sa.Column("provisioned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "repositories",
        sa.Column("provisioning_error_code", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("repositories", "provisioning_error_code")
    op.drop_column("repositories", "provisioned_at")
    op.drop_column("repositories", "provisioning_state")
    repository_provisioning_state.drop(op.get_bind(), checkfirst=True)
