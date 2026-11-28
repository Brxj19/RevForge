from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ActivityEventResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    icon: str
    who: str
    action: str
    target: str
    no_link: bool = Field(default=False, alias="noLink", serialization_alias="noLink")
    ref: str
    time: str
    fail: bool = False


class ActivityListResponse(BaseModel):
    items: list[ActivityEventResponse]
