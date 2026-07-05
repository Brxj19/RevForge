from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class ApiHealthResponse(HealthResponse):
    api_version: str
