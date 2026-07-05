from __future__ import annotations

from app.core.config import get_settings


def test_settings_parse_cors_origins(monkeypatch) -> None:
    monkeypatch.setenv(
        "REVFORGE_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )

    settings = get_settings()

    assert settings.cors_allowed_origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


def test_settings_use_expected_defaults() -> None:
    settings = get_settings()

    assert settings.api_v1_prefix == "/api/v1"
    assert settings.database_url.startswith("postgresql+asyncpg://")
    assert settings.redis_url == "redis://localhost:6379/0"
    assert settings.repository_root == "./.local/repositories"
    assert settings.hg_executable == "hg"
    assert settings.max_history_page_size > 0
