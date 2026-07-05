from __future__ import annotations

from enum import StrEnum


class OrganizationRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class RepositoryRole(StrEnum):
    READ = "read"
    WRITE = "write"
    ADMIN = "admin"


class RepositoryVisibility(StrEnum):
    PUBLIC = "public"
    INTERNAL = "internal"
    PRIVATE = "private"
