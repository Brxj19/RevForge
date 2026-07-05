from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
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

    @field_validator("session_cookie_name")
    @classmethod
    def validate_session_cookie_name(cls, value: str, info):
        secure = info.data.get("session_cookie_secure", False)
        domain = info.data.get("session_cookie_domain")
        if value.startswith("__Host-") and (not secure or domain is not None):
            raise ValueError("__Host- cookies require Secure=true and no configured cookie domain.")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
