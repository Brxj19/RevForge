from __future__ import annotations

from functools import lru_cache
from typing import Annotated

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
