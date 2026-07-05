from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.router import router as v1_router
from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["health"])
async def root_health() -> HealthResponse:
    return HealthResponse(status="ok", service="revforge-backend")


router.include_router(v1_router)
