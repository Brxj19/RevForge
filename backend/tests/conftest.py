from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.deps import get_session
from app.core.config import get_settings
from app.db.base import Base


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()


@pytest.fixture
def settings_env(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("REVFORGE_SESSION_SECRET_KEY", "test-session-secret")
    monkeypatch.setenv("REVFORGE_CORS_ALLOWED_ORIGINS", "http://localhost:5173")
    monkeypatch.setenv("REVFORGE_SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("REVFORGE_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("REVFORGE_REPOSITORY_ROOT", str(tmp_path / "repositories"))
    monkeypatch.setenv(
        "REVFORGE_SSH_AUTHORIZED_KEYS_PATH",
        str(tmp_path / "ssh" / "authorized_keys"),
    )
    monkeypatch.setenv("REVFORGE_MAX_HISTORY_PAGE_SIZE", "2")
    monkeypatch.setenv("REVFORGE_MAX_DIFF_BYTES", "65536")
    monkeypatch.setenv("REVFORGE_MAX_FILE_CONTENT_BYTES", "32768")


@pytest_asyncio.fixture
async def session_factory(settings_env: None) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    import app.models  # noqa: F401

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    yield factory
    await engine.dispose()


@pytest.fixture
def client(session_factory: async_sessionmaker[AsyncSession], settings_env: None) -> TestClient:
    from app.main import create_application

    application = create_application()
    application.state.transport_session_factory_holder["factory"] = session_factory

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    application.dependency_overrides[get_session] = override_get_session
    return TestClient(application)
