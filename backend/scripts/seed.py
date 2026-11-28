"""
Seed the database with a platform admin user.

Usage (from repo root):
    cd backend && .venv/bin/python -m scripts.seed

Or via Make:
    make seed

This script is idempotent — running it again skips rows that already exist.
After seeding, sign in at http://localhost:5174 with:

    Email:    admin@revforge.dev
    Password: Admin12345678

Then create organizations, repositories, and invite users through the UI.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure the backend package is importable when invoked as `python -m scripts.seed`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, utc_now
from app.db.session import SessionLocal, engine
from app.models.user import User
from app.models.user_password_credential import UserPasswordCredential

ADMIN_EMAIL = "admin@revforge.dev"
ADMIN_DISPLAY_NAME = "RevForge Admin"
ADMIN_HANDLE = "admin"
ADMIN_PASSWORD = "Admin12345678"


async def seed_platform_admin(session: AsyncSession) -> None:
    existing = await session.scalar(select(User).where(User.email == ADMIN_EMAIL))
    if existing is not None:
        print(f"  ✓ Platform admin already exists (handle=@{existing.handle})")
        if not existing.is_platform_admin:
            existing.is_platform_admin = True
            await session.commit()
            print("    → Promoted to platform admin")
        return

    now = utc_now()
    user = User(
        email=ADMIN_EMAIL,
        display_name=ADMIN_DISPLAY_NAME,
        handle=ADMIN_HANDLE,
        is_active=True,
        is_platform_admin=True,
        email_verified_at=now,
    )
    session.add(user)
    await session.flush()

    credential = UserPasswordCredential(
        user_id=user.id,
        password_hash=hash_password(ADMIN_PASSWORD),
    )
    session.add(credential)
    await session.commit()

    print(f"  ✓ Created platform admin: {ADMIN_EMAIL} / @{ADMIN_HANDLE}")
    print(f"    Password: {ADMIN_PASSWORD}")


async def main() -> None:
    print("\n--- RevForge seed ---\n")

    async with SessionLocal() as session:
        await seed_platform_admin(session)

    await engine.dispose()
    print("\n--- Done. Sign in at http://localhost:5174 ---\n")


if __name__ == "__main__":
    asyncio.run(main())
