from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = Field(default="development", alias="REVFORGE_ENVIRONMENT")
    debug: bool = Field(default=False, alias="REVFORGE_DEBUG")
    log_level: str = Field(default="INFO", alias="REVFORGE_LOG_LEVEL")
    api_v1_prefix: str = Field(default="/api/v1", alias="REVFORGE_API_V1_PREFIX")
    database_url: str = Field(
        default="postgresql+asyncpg://revforge:revforge@localhost:5432/revforge",
        alias="REVFORGE_DATABASE_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REVFORGE_REDIS_URL")
    repository_root: str = Field(default="./.local/repositories", alias="REVFORGE_REPOSITORY_ROOT")
    hg_http_base_path: str = Field(default="/hg", alias="REVFORGE_HG_HTTP_BASE_PATH")
    transport_hg_username: str = Field(
        default="revforge-hg", alias="REVFORGE_TRANSPORT_HG_USERNAME"
    )
    transport_token_secret: str = Field(
        default="change-me-transport-secret",
        alias="REVFORGE_TRANSPORT_TOKEN_SECRET",
    )
    transport_rate_limit_window_seconds: int = Field(
        default=60,
        alias="REVFORGE_TRANSPORT_RATE_LIMIT_WINDOW_SECONDS",
    )
    transport_rate_limit_max_attempts: int = Field(
        default=30,
        alias="REVFORGE_TRANSPORT_RATE_LIMIT_MAX_ATTEMPTS",
    )
    ssh_authorized_keys_path: str = Field(
        default="./.local/ssh/authorized_keys",
        alias="REVFORGE_SSH_AUTHORIZED_KEYS_PATH",
    )
    event_spool_dir: str = Field(default="./.local/event-spool", alias="REVFORGE_EVENT_SPOOL_DIR")
    hg_executable: str = Field(default="hg", alias="REVFORGE_HG_EXECUTABLE")
    hg_command_timeout_seconds: int = Field(
        default=15,
        alias="REVFORGE_HG_COMMAND_TIMEOUT_SECONDS",
    )
    hg_max_stdout_bytes: int = Field(default=524288, alias="REVFORGE_HG_MAX_STDOUT_BYTES")
    hg_max_stderr_bytes: int = Field(default=65536, alias="REVFORGE_HG_MAX_STDERR_BYTES")
    max_diff_bytes: int = Field(default=262144, alias="REVFORGE_MAX_DIFF_BYTES")
    max_file_content_bytes: int = Field(
        default=131072,
        alias="REVFORGE_MAX_FILE_CONTENT_BYTES",
    )
    max_history_page_size: int = Field(default=50, alias="REVFORGE_MAX_HISTORY_PAGE_SIZE")
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        alias="REVFORGE_CORS_ALLOWED_ORIGINS",
    )
    sqlalchemy_echo: bool = Field(default=False, alias="REVFORGE_SQLALCHEMY_ECHO")
    session_secret_key: str = Field(
        default="change-me-in-local-env", alias="REVFORGE_SESSION_SECRET_KEY"
    )
    session_cookie_name: str = Field(
        default="revforge_session", alias="REVFORGE_SESSION_COOKIE_NAME"
    )
    csrf_cookie_name: str = Field(default="revforge_csrf", alias="REVFORGE_CSRF_COOKIE_NAME")
    session_cookie_secure: bool = Field(default=False, alias="REVFORGE_SESSION_COOKIE_SECURE")
    session_cookie_httponly: bool = Field(default=True, alias="REVFORGE_SESSION_COOKIE_HTTPONLY")
    session_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax",
        alias="REVFORGE_SESSION_COOKIE_SAMESITE",
    )
    session_cookie_domain: str | None = Field(default=None, alias="REVFORGE_SESSION_COOKIE_DOMAIN")
    session_ttl_minutes: int = Field(default=1440, alias="REVFORGE_SESSION_TTL_MINUTES")
    password_min_length: int = Field(default=12, alias="REVFORGE_PASSWORD_MIN_LENGTH")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @field_validator("session_cookie_domain", mode="before")
    @classmethod
    def normalize_cookie_domain(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("hg_http_base_path")
    @classmethod
    def normalize_hg_http_base_path(cls, value: str) -> str:
        normalized = value.strip() or "/hg"
        if not normalized.startswith("/"):
            raise ValueError("Mercurial HTTP base path must start with '/'.")
        return normalized.rstrip("/") or "/"

    @field_validator("ssh_authorized_keys_path")
    @classmethod
    def normalize_ssh_authorized_keys_path(cls, value: str) -> str:
        normalized = value.strip() or "./.local/ssh/authorized_keys"
        return normalized

    @field_validator("session_cookie_name")
    @classmethod
    def validate_session_cookie_name(cls, value: str, info: ValidationInfo) -> str:
        secure = info.data.get("session_cookie_secure", False)
        domain = info.data.get("session_cookie_domain")
        if value.startswith("__Host-") and (not secure or domain is not None):
            raise ValueError("__Host- cookies require Secure=true and no configured cookie domain.")
        return value

    @field_validator(
        "hg_command_timeout_seconds",
        "hg_max_stdout_bytes",
        "hg_max_stderr_bytes",
        "max_diff_bytes",
        "max_file_content_bytes",
        "max_history_page_size",
        "transport_rate_limit_window_seconds",
        "transport_rate_limit_max_attempts",
    )
    @classmethod
    def validate_positive_limits(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Mercurial limits must be positive integers.")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
