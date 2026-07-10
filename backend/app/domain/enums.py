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


class RepositoryProvisioningState(StrEnum):
    UNPROVISIONED = "unprovisioned"
    PROVISIONING = "provisioning"
    READY = "ready"
    FAILED = "failed"


class PullRequestState(StrEnum):
    OPEN = "open"
    DRAFT = "draft"
    MERGED = "merged"
    CLOSED = "closed"


class ReviewDecision(StrEnum):
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    COMMENT = "comment"
