"""Forward and downgrade check for 0008_provisioning_attempts (I36).

Needs a disposable PostgreSQL database (the migration chain uses PostgreSQL DDL):

    REVFORGE_MIGRATION_TEST_DATABASE_URL=postgresql+asyncpg://user:pw@host:5432/scratch_db

The test upgrades to head, downgrades one step, and upgrades again. Never point it at a
database you care about.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from alembic.config import Config
from app.core.config import get_settings

DATABASE_URL = os.environ.get("REVFORGE_MIGRATION_TEST_DATABASE_URL")
BACKEND_ROOT = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skipif(
    DATABASE_URL is None, reason="REVFORGE_MIGRATION_TEST_DATABASE_URL is not set"
)


def _columns_and_indexes() -> tuple[set[str], set[str]]:
    async def inspect_db() -> tuple[set[str], set[str]]:
        engine = create_async_engine(str(DATABASE_URL))
        try:
            async with engine.connect() as connection:

                def read(sync_connection: object) -> tuple[set[str], set[str]]:
                    inspector = inspect(sync_connection)
                    columns = {column["name"] for column in inspector.get_columns("repositories")}
                    indexes = {
                        str(index["name"]) for index in inspector.get_indexes("repositories")
                    }
                    return columns, indexes

                return await connection.run_sync(read)
        finally:
            await engine.dispose()

    return asyncio.run(inspect_db())


def test_0008_upgrade_downgrade_upgrade(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REVFORGE_DATABASE_URL", str(DATABASE_URL))
    get_settings.cache_clear()
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))

    command.upgrade(config, "head")
    columns, indexes = _columns_and_indexes()
    assert {"provisioning_started_at", "provisioning_attempt_id"} <= columns
    assert "ix_repositories_provisioning_state_started_at" in indexes

    command.downgrade(config, "0007_pr_review_unique")
    columns, indexes = _columns_and_indexes()
    assert "provisioning_started_at" not in columns
    assert "provisioning_attempt_id" not in columns
    assert "ix_repositories_provisioning_state_started_at" not in indexes

    command.upgrade(config, "head")
    columns, _indexes = _columns_and_indexes()
    assert {"provisioning_started_at", "provisioning_attempt_id"} <= columns
