from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.wsgi import WSGIMiddleware

from app.api.router import router as api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.db.session import SessionLocal
from app.mercurial.http_gateway_service import create_http_gateway_application


def create_application() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.environment)

    application = FastAPI(
        title="RevForge Backend",
        version="0.1.0",
        debug=settings.debug,
    )

    application.add_middleware(RequestContextMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Request-ID"],
    )

    session_factory_holder = {"factory": SessionLocal}
    application.state.transport_session_factory_holder = session_factory_holder
    application.mount(
        settings.hg_http_base_path,
        WSGIMiddleware(
            create_http_gateway_application(
                settings=settings,
                session_factory_getter=lambda: session_factory_holder["factory"],
            )
        ),
    )

    register_exception_handlers(application)
    application.include_router(api_router)
    return application


app = create_application()
