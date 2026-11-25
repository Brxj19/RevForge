"""Add handle column to users table.

Revision ID: 0013_user_handle
Revises: 0012_invitations
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0013_user_handle"
down_revision = "0012_invitations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: add the column as nullable.
    op.add_column("users", sa.Column("handle", sa.String(40), nullable=True))

    # Step 2: backfill from email local-part, lowercased.
    # Resolve conflicts by appending a counter.
    conn = op.get_bind()
    users = conn.execute(sa.text("SELECT id, email FROM users ORDER BY created_at ASC"))
    seen: dict[str, int] = {}
    for user_id, email in users:
        local_part = email.split("@")[0].lower()
        # Sanitize: keep only alphanumeric and hyphens, strip leading/trailing hyphens.
        sanitized = ""
        for ch in local_part:
            if ch.isalnum() or ch == "-":
                sanitized += ch
            elif ch in ".+_":
                sanitized += "-"
        sanitized = sanitized.strip("-")[:30] or "user"
        base = sanitized
        candidate = base
        counter = 1
        while candidate in seen:
            suffix = str(counter)
            candidate = f"{base[: 40 - len(suffix) - 1]}-{suffix}"
            counter += 1
        seen[candidate] = 1
        conn.execute(
            sa.text("UPDATE users SET handle = :handle WHERE id = :id"),
            {"handle": candidate, "id": user_id},
        )

    # Step 3: set NOT NULL.
    op.alter_column("users", "handle", nullable=False)

    # Step 4: unique index.
    op.create_index("ix_users_handle", "users", ["handle"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_handle", table_name="users")
    op.drop_column("users", "handle")
