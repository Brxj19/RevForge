from __future__ import annotations

import ipaddress
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, ValidationInfo, field_validator, model_validator
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
    public_base_url: str = Field(default="http://localhost:8000", alias="REVFORGE_PUBLIC_BASE_URL")
    frontend_base_url: str | None = Field(
        default=None,
        alias="REVFORGE_FRONTEND_BASE_URL",
    )
    email_backend: Literal["console", "smtp"] = Field(
        default="console", alias="REVFORGE_EMAIL_BACKEND"
    )
    email_from: str = Field(
        default="RevForge <no-reply@revforge.local>", alias="REVFORGE_EMAIL_FROM"
    )
    smtp_host: str = Field(default="localhost", alias="REVFORGE_SMTP_HOST")
    smtp_port: int = Field(default=1025, alias="REVFORGE_SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="REVFORGE_SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="REVFORGE_SMTP_PASSWORD")
    smtp_use_tls: bool = Field(default=False, alias="REVFORGE_SMTP_USE_TLS")
    smtp_use_ssl: bool = Field(default=False, alias="REVFORGE_SMTP_USE_SSL")
    smtp_timeout_seconds: float = Field(default=10.0, alias="REVFORGE_SMTP_TIMEOUT_SECONDS")
    hg_http_base_path: str = Field(default="/hg", alias="REVFORGE_HG_HTTP_BASE_PATH")
    hg_http_public_base_url: str | None = Field(
        default=None,
        alias="REVFORGE_HG_HTTP_PUBLIC_BASE_URL",
    )
    ssh_public_host: str = Field(default="localhost", alias="REVFORGE_SSH_PUBLIC_HOST")
    ssh_public_port: int | None = Field(default=None, alias="REVFORGE_SSH_PUBLIC_PORT")
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
    ssh_gateway_command: str = Field(
        default="python -m app.mercurial.ssh_gateway",
        alias="REVFORGE_SSH_GATEWAY_COMMAND",
    )
    event_spool_dir: str = Field(default="./.local/event-spool", alias="REVFORGE_EVENT_SPOOL_DIR")
    hg_executable: str = Field(default="hg", alias="REVFORGE_HG_EXECUTABLE")
    hg_command_timeout_seconds: int = Field(
        default=15,
        alias="REVFORGE_HG_COMMAND_TIMEOUT_SECONDS",
    )
    transport_max_body_bytes: int = Field(
        default=268435456, alias="REVFORGE_TRANSPORT_MAX_BODY_BYTES"
    )
    hg_max_stdout_bytes: int = Field(default=524288, alias="REVFORGE_HG_MAX_STDOUT_BYTES")
    hg_max_stderr_bytes: int = Field(default=65536, alias="REVFORGE_HG_MAX_STDERR_BYTES")
    max_diff_bytes: int = Field(default=262144, alias="REVFORGE_MAX_DIFF_BYTES")
    max_file_content_bytes: int = Field(
        default=131072,
        alias="REVFORGE_MAX_FILE_CONTENT_BYTES",
    )
    max_history_page_size: int = Field(default=50, alias="REVFORGE_MAX_HISTORY_PAGE_SIZE")
    max_raw_bytes: int = Field(default=10 * 1024 * 1024, alias="REVFORGE_MAX_RAW_BYTES")
    hg_max_concurrent_operations: int = Field(
        default=8, alias="REVFORGE_HG_MAX_CONCURRENT_OPERATIONS"
    )
    hg_max_concurrent_per_repository: int = Field(
        default=3, alias="REVFORGE_HG_MAX_CONCURRENT_PER_REPOSITORY"
    )
    tree_last_changeset_file_cap: int = Field(
        default=10_000, alias="REVFORGE_TREE_LAST_CHANGESET_FILE_CAP"
    )
    stats_contributor_scan_cap: int = Field(
        default=20_000, alias="REVFORGE_STATS_CONTRIBUTOR_SCAN_CAP"
    )
    code_search_max_files: int = Field(default=20_000, alias="REVFORGE_CODE_SEARCH_MAX_FILES")
    code_search_max_total_bytes: int = Field(
        default=64 * 1024 * 1024, alias="REVFORGE_CODE_SEARCH_MAX_TOTAL_BYTES"
    )
    code_search_max_file_bytes: int = Field(
        default=1024 * 1024, alias="REVFORGE_CODE_SEARCH_MAX_FILE_BYTES"
    )
    code_search_timeout_seconds: float = Field(
        default=5.0, alias="REVFORGE_CODE_SEARCH_TIMEOUT_SECONDS"
    )
    # Phase 2 history/diff bounds (in-process Mercurial work).
    history_scan_max_revisions: int = Field(
        default=20_000, alias="REVFORGE_HISTORY_SCAN_MAX_REVISIONS"
    )
    history_scan_timeout_seconds: float = Field(
        default=5.0, alias="REVFORGE_HISTORY_SCAN_TIMEOUT_SECONDS"
    )
    diff_max_file_input_bytes: int = Field(
        default=4 * 1024 * 1024, alias="REVFORGE_DIFF_MAX_FILE_INPUT_BYTES"
    )
    diff_max_total_input_bytes: int = Field(
        default=32 * 1024 * 1024, alias="REVFORGE_DIFF_MAX_TOTAL_INPUT_BYTES"
    )
    diff_timeout_seconds: float = Field(default=10.0, alias="REVFORGE_DIFF_TIMEOUT_SECONDS")
    read_rate_limit_window_seconds: int = Field(
        default=60, alias="REVFORGE_READ_RATE_LIMIT_WINDOW_SECONDS"
    )
    read_rate_limit_max_requests: int = Field(
        default=120, alias="REVFORGE_READ_RATE_LIMIT_MAX_REQUESTS"
    )
    provisioning_stale_after_seconds: int = Field(
        default=300, alias="REVFORGE_PROVISIONING_STALE_AFTER_SECONDS"
    )
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
    session_idle_minutes: int = Field(default=30, alias="REVFORGE_SESSION_IDLE_MINUTES")
    session_touch_interval_seconds: int = Field(
        default=60, alias="REVFORGE_SESSION_TOUCH_INTERVAL_SECONDS"
    )
    session_remember_ttl_days: int = Field(default=30, alias="REVFORGE_SESSION_REMEMBER_TTL_DAYS")
    email_verify_token_ttl_minutes: int = Field(
        default=60, alias="REVFORGE_EMAIL_VERIFY_TOKEN_TTL_MINUTES"
    )
    password_reset_token_ttl_minutes: int = Field(
        default=30, alias="REVFORGE_PASSWORD_RESET_TOKEN_TTL_MINUTES"
    )
    trusted_proxy_cidrs: str = Field(default="", alias="REVFORGE_TRUSTED_PROXY_CIDRS")
    auth_login_ip_max_failures: int = Field(default=20, alias="REVFORGE_AUTH_LOGIN_IP_MAX_FAILURES")
    auth_login_ip_window_seconds: int = Field(
        default=900, alias="REVFORGE_AUTH_LOGIN_IP_WINDOW_SECONDS"
    )
    auth_register_ip_max_requests: int = Field(
        default=5, alias="REVFORGE_AUTH_REGISTER_IP_MAX_REQUESTS"
    )
    auth_register_ip_window_seconds: int = Field(
        default=900, alias="REVFORGE_AUTH_REGISTER_IP_WINDOW_SECONDS"
    )
    auth_check_handle_ip_max_requests: int = Field(
        default=30, alias="REVFORGE_AUTH_CHECK_HANDLE_IP_MAX_REQUESTS"
    )
    auth_check_handle_ip_window_seconds: int = Field(
        default=60, alias="REVFORGE_AUTH_CHECK_HANDLE_IP_WINDOW_SECONDS"
    )
    auth_rate_limit_backend: Literal["auto", "redis", "memory"] = Field(
        default="auto", alias="REVFORGE_AUTH_RATE_LIMIT_BACKEND"
    )
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

    @field_validator(
        "public_base_url", "frontend_base_url", "hg_http_public_base_url", mode="before"
    )
    @classmethod
    def normalize_public_urls(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        return normalized.rstrip("/")

    @field_validator("ssh_authorized_keys_path")
    @classmethod
    def normalize_ssh_authorized_keys_path(cls, value: str) -> str:
        normalized = value.strip() or "./.local/ssh/authorized_keys"
        return normalized

    @field_validator("ssh_public_host")
    @classmethod
    def normalize_ssh_public_host(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("SSH public host cannot be empty.")
        return normalized

    @field_validator("ssh_gateway_command")
    @classmethod
    def normalize_ssh_gateway_command(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("SSH gateway command cannot be empty.")
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
        "transport_max_body_bytes",
        "hg_max_stdout_bytes",
        "hg_max_stderr_bytes",
        "max_diff_bytes",
        "max_file_content_bytes",
        "max_history_page_size",
        "max_raw_bytes",
        "hg_max_concurrent_operations",
        "hg_max_concurrent_per_repository",
        "tree_last_changeset_file_cap",
        "stats_contributor_scan_cap",
        "code_search_max_files",
        "code_search_max_total_bytes",
        "code_search_max_file_bytes",
        "history_scan_max_revisions",
        "diff_max_file_input_bytes",
        "diff_max_total_input_bytes",
        "read_rate_limit_window_seconds",
        "read_rate_limit_max_requests",
        "provisioning_stale_after_seconds",
        "transport_rate_limit_window_seconds",
        "transport_rate_limit_max_attempts",
        "session_ttl_minutes",
        "session_idle_minutes",
        "session_touch_interval_seconds",
        "email_verify_token_ttl_minutes",
        "password_reset_token_ttl_minutes",
        "auth_login_ip_max_failures",
        "auth_login_ip_window_seconds",
        "auth_register_ip_max_requests",
        "auth_register_ip_window_seconds",
        "auth_check_handle_ip_max_requests",
        "auth_check_handle_ip_window_seconds",
    )
    @classmethod
    def validate_positive_limits(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Configured limits must be positive integers.")
        return value

    @field_validator("session_remember_ttl_days")
    @classmethod
    def validate_remember_ttl_days(cls, value: int) -> int:
        if value < 1 or value > 90:
            raise ValueError("session_remember_ttl_days must be between 1 and 90.")
        return value

    @field_validator("trusted_proxy_cidrs")
    @classmethod
    def validate_trusted_proxy_cidrs(cls, value: str) -> str:
        for entry in value.split(","):
            cleaned = entry.strip()
            if not cleaned:
                continue
            ipaddress.ip_network(cleaned, strict=False)
        return value

    @field_validator("email_from")
    @classmethod
    def validate_email_from(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or "\r" in cleaned or "\n" in cleaned:
            raise ValueError("REVFORGE_EMAIL_FROM must be a single-line sender address.")
        return cleaned

    @field_validator("smtp_port")
    @classmethod
    def validate_smtp_port(cls, value: int) -> int:
        if value < 1 or value > 65535:
            raise ValueError("smtp_port must be between 1 and 65535.")
        return value

    @model_validator(mode="after")
    def validate_session_idle_within_ttl(self) -> Settings:
        if self.session_idle_minutes > self.session_ttl_minutes:
            raise ValueError("session_idle_minutes must not exceed session_ttl_minutes.")
        if self.smtp_use_tls and self.smtp_use_ssl:
            raise ValueError("smtp_use_tls and smtp_use_ssl cannot both be enabled.")
        return self

    @property
    def email_link_base_url(self) -> str:
        return self.frontend_base_url or self.public_base_url

    @property
    def parsed_trusted_proxy_networks(
        self,
    ) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
        networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
        for entry in self.trusted_proxy_cidrs.split(","):
            cleaned = entry.strip()
            if not cleaned:
                continue
            networks.append(ipaddress.ip_network(cleaned, strict=False))
        return tuple(networks)

    @field_validator(
        "code_search_timeout_seconds",
        "history_scan_timeout_seconds",
        "diff_timeout_seconds",
        "smtp_timeout_seconds",
    )
    @classmethod
    def validate_positive_float(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Timeouts must be positive.")
        return value

    @field_validator("ssh_public_port")
    @classmethod
    def validate_ssh_public_port(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("SSH public port must be a positive integer.")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
