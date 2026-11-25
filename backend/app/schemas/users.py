from __future__ import annotations

from pydantic import BaseModel


class UserSearchResult(BaseModel):
    user_id: str
    display_name: str
    handle: str
    email: str | None = None
    eligible: bool = True
    status: str = ""
    label: str = ""


class UserSearchResponse(BaseModel):
    items: list[UserSearchResult]


class PublicUserResponse(BaseModel):
    handle: str
    display_name: str
    email: str | None = None
    organizations: list[str] = []
    is_own_profile: bool = False
