from __future__ import annotations

from enum import StrEnum


class OrganizationRole(StrEnum):
    MEMBER = "member"
    ADMIN = "admin"


class RepositoryVisibility(StrEnum):
    PRIVATE = "private"
    PUBLIC = "public"

