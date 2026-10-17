"""Record-only verification for pull-request merges.

RevForge does not perform a server-side Mercurial merge. A PR may only be
marked MERGED once the merge has actually been performed by a client and
pushed — i.e. the PR's source revision is contained in the target revision's
history (audit C15). This module verifies that and returns the full target
node to record as the merge point.

Revisions are resolved in-process on the served view (never passed to ``hg log -r``),
so stored values cannot act as revsets and secret changesets are never matched (I34).
"""

from __future__ import annotations

from pathlib import Path

from app.mercurial.errors import (
    InvalidRevisionError,
    RevisionAmbiguousError,
    RevisionNotFoundError,
)
from app.mercurial.read_service import MercurialReadService
from app.services.errors import ConflictError, ValidationFailure


async def _resolve_single_node(
    read_service: MercurialReadService, *, repository_path: Path, revision: str
) -> str:
    try:
        return await read_service.resolve_revision(repository_path, revision)
    except (InvalidRevisionError, RevisionAmbiguousError, RevisionNotFoundError) as exc:
        # The null revision and working-directory pseudo-node also land here.
        raise ValidationFailure("Unknown or invalid revision.") from exc


async def verify_landed_merge(
    read_service: MercurialReadService,
    *,
    repository_path: Path,
    source_revision: str,
    target_revision: str,
) -> str:
    """Return the target branch's current head if it contains source and the pinned target.

    Raises ValidationFailure if a revision is unknown, invalid or ambiguous, or
    ConflictError if the source has not been merged into the target.
    """
    source_node = await _resolve_single_node(
        read_service, repository_path=repository_path, revision=source_revision
    )
    target_node = await _resolve_single_node(
        read_service, repository_path=repository_path, revision=target_revision
    )
    # The pinned target is where the PR branched off; the merge lands on a later head of
    # that branch, which must contain both the source and the pinned target (I34/L1).
    head = await read_service.landed_head(repository_path, source=source_node, target=target_node)
    if head is None:
        raise ConflictError(
            "Source has not been merged into the target branch; push the merge first."
        )
    return head
