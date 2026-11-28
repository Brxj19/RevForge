from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, min_length=1, max_length=320)
    author_aliases: list[str] | None = None


class UserProfileResponse(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    author_aliases: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserPreferences(BaseModel):
    accent: Literal["default", "tech", "professional", "luxury"] = "default"
    graph_default: bool = True
    compact: bool = False
    reduce_motion: bool = False


class PinRef(BaseModel):
    org: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=100)


class PinListResponse(BaseModel):
    items: list[PinRef]


class PinListRequest(BaseModel):
    items: list[PinRef] = Field(max_length=8)


class NotificationSetting(BaseModel):
    in_app: bool = True
    email: bool = True


class NotificationSettingsResponse(BaseModel):
    review_requested: NotificationSetting = Field(default_factory=NotificationSetting)
    review_on_your_pr: NotificationSetting = Field(default_factory=NotificationSetting)
    mentions: NotificationSetting = Field(default_factory=NotificationSetting)
    merged_or_closed: NotificationSetting = Field(
        default_factory=lambda: NotificationSetting(email=False)
    )
    webhook_failures: NotificationSetting = Field(default_factory=NotificationSetting)
    sign_in_new_device: NotificationSetting = Field(default_factory=NotificationSetting)
