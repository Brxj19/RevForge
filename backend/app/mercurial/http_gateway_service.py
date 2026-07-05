from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal

from .http_gateway import HgHttpGatewayApplication


def create_http_gateway_application(
    *,
    settings: Settings | None = None,
    session_factory_getter: Callable[[], async_sessionmaker[AsyncSession]] | None = None,
) -> HgHttpGatewayApplication:
    resolved_settings = settings or get_settings()
    resolved_session_factory_getter = session_factory_getter or (lambda: SessionLocal)
    return HgHttpGatewayApplication(
        settings=resolved_settings,
        session_factory_getter=resolved_session_factory_getter,
    )


application = create_http_gateway_application()
