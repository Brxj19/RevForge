"""Pull-request revision pinning and diff (I8/I31/I34).

Revisions are resolved only through the read service's served-view resolver (full node,
bookmark, tag, branch, or hex prefix of at least 6 digits); no revset from a request is
ever evaluated. The diff runs in-process from ``ancestor(target, source)`` to ``source``
with the shared, bounded diff model, under the hg work limiter.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.mercurial.errors import (
    InvalidRevisionError,
    RevisionAmbiguousError,
    RevisionNotFoundError,
)
from app.mercurial.read_service import MercurialReadService
from app.services.errors import ValidationFailure


async def resolve_pull_request_revisions(
    read_service: MercurialReadService,
    *,
    repository_path: Path,
    source_revision: str,
    target_revision: str,
) -> tuple[str, str]:
    """Pin both PR revisions to full 40-hex served nodes; ValidationFailure otherwise."""
    nodes: list[str] = []
    for label, value in (
        ("source_revision", source_revision),
        ("target_revision", target_revision),
    ):
        try:
            nodes.append(await read_service.resolve_revision(repository_path, value))
        except InvalidRevisionError as exc:
            raise ValidationFailure(f"{label} is not a valid revision.") from exc
        except RevisionAmbiguousError as exc:
            raise ValidationFailure(f"{label} is an ambiguous revision prefix.") from exc
        except RevisionNotFoundError as exc:
            raise ValidationFailure(f"{label} was not found.") from exc
    return nodes[0], nodes[1]


async def compute_diff(
    read_service: MercurialReadService,
    *,
    repository_path: Path,
    source_revision: str,
    target_revision: str,
) -> tuple[list[dict[str, Any]], int, int, int]:
    """Per-file changes from the merge base of target and source to source.

    Stored values are full nodes since I34; older rows may hold a ref or prefix, which the
    same served-view resolver handles (an unknown value raises RevisionNotFoundError).
    """
    _target_node, _source_node, result = await read_service.diff_against_merge_base(
        repository_path, base=target_revision, head=source_revision
    )
    changed_files: list[dict[str, Any]] = []
    total_additions = 0
    total_deletions = 0
    for item in result.files:
        total_additions += item.insertions
        total_deletions += item.deletions
        changed_files.append(
            {
                "path": item.path,
                "additions": item.insertions,
                "deletions": item.deletions,
                "status": item.status,
                "old_path": item.old_path,
                "binary": item.binary,
                "too_large": item.too_large,
            }
        )
    return changed_files, total_additions, total_deletions, len(changed_files)
