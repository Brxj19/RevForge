from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class RepoSearchHit(BaseModel):
    org_slug: str
    repo_slug: str
    display_name: str
    description: str | None
    visibility: str
    language: str | None = None
    language_color: str | None = None
    updated_at: datetime
    watchers: int = 0
    activity: list[int] = []


class FacetItem(BaseModel):
    value: str
    count: int


class SearchFacets(BaseModel):
    language: list[FacetItem] = []
    organization: list[FacetItem] = []
    visibility: list[FacetItem] = []


class RepoSearchResponse(BaseModel):
    items: list[RepoSearchHit]
    facets: SearchFacets
    next_cursor: str | None = None


class OrgSearchHit(BaseModel):
    slug: str
    display_name: str
    repo_count: int


class OrgSearchResponse(BaseModel):
    items: list[OrgSearchHit]
