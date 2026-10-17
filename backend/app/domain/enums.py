from __future__ import annotations

from enum import StrEnum
from typing import Literal, get_args


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


# Public provisioning failure codes (I36). Never stderr, paths or exception text.
ProvisioningErrorCode = Literal[
    "hg_init_failed",
    "hg_verify_failed",
    "storage_error",
    "storage_conflict",
    "provisioning_stale",
    "cancelled",
]
PROVISIONING_ERROR_CODES: frozenset[str] = frozenset(get_args(ProvisioningErrorCode))
