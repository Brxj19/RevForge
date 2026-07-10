from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.events import router as events_router
from app.api.v1.health import router as health_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.pull_requests import router as pull_requests_router
from app.api.v1.repositories import router as repositories_router
from app.api.v1.security import router as security_router
from app.api.v1.webhooks import router as webhooks_router
from app.core.config import get_settings

settings = get_settings()

router = APIRouter(prefix=settings.api_v1_prefix)
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(security_router)
router.include_router(organizations_router)
router.include_router(repositories_router)
router.include_router(events_router)
router.include_router(webhooks_router)
router.include_router(pull_requests_router)
