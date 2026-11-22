"""Exercise the number constraint and the non-destructive duplicate guard."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from alembic.migration import MigrationContext
from alembic.operations import Operations

_path = Path(__file__).resolve().parents[1] / "alembic/versions/0010_pr_number_unique.py"
_spec = importlib.util.spec_from_file_location("migration_0010", _path)
assert _spec and _spec.loader
_migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_migration)


@pytest.fixture
def connection():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "CREATE TABLE pull_requests (id INTEGER PRIMARY KEY, "
                "repository_id TEXT NOT NULL, number INTEGER NOT NULL)"
            )
        )
        yield conn
    engine.dispose()


def _run(connection, fn) -> None:
    with Operations.context(MigrationContext.configure(connection)):
        fn()


def test_constraint_upgrade_and_downgrade(connection) -> None:
    _run(connection, _migration.upgrade)
    connection.execute(sa.text("INSERT INTO pull_requests VALUES (1, 'a', 1), (2, 'b', 1)"))
    with pytest.raises(IntegrityError):
        connection.execute(sa.text("INSERT INTO pull_requests VALUES (3, 'a', 1)"))
    _run(connection, _migration.downgrade)
    connection.execute(sa.text("INSERT INTO pull_requests VALUES (3, 'a', 1)"))


def test_upgrade_refuses_duplicates_without_renumbering(connection) -> None:
    connection.execute(sa.text("INSERT INTO pull_requests VALUES (1, 'a', 7), (2, 'a', 7)"))
    with pytest.raises(RuntimeError, match="Duplicate pull request numbers"):
        _run(connection, _migration.upgrade)
    assert connection.execute(
        sa.text("SELECT number FROM pull_requests ORDER BY id")
    ).scalars().all() == [7, 7]
