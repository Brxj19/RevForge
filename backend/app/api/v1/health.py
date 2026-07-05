from __future__ import annotations

from fastapi import APIRouter

from app.schemas.health import ApiHealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiHealthResponse)
async def api_health() -> ApiHealthResponse:
    return ApiHealthResponse(status="ok", service="revforge-api", api_version="v1")
