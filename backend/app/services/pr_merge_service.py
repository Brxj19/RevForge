"""Record-only verification for pull-request merges.

RevForge does not perform a server-side Mercurial merge. A PR may only be
marked MERGED once the merge has actually been performed by a client and
pushed — i.e. the PR's source revision is contained in the target revision's
history (audit C15). This module verifies that and returns the full target
node to record as the merge point.
"""

from __future__ import annotations

from pathlib import Path

from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.errors import HgCommandFailedError
from app.services.errors import ConflictError, ValidationFailure

_FULL_NODE_LENGTH = 40
_NULL_NODE = "0" * 40


async def _resolve_single_node(
    command_runner: HgCommandRunner, *, repository_path: Path, revision: str
) -> str:
    try:
        result = await command_runner.run(
            ["log", "-r", revision, "-T", "{node}\n"],
            repository_path=repository_path,
        )
    except HgCommandFailedError as exc:
        raise ValidationFailure(f"Unknown or invalid revision: {revision}") from exc
    nodes = [line for line in result.stdout.decode("utf-8", "replace").split("\n") if line]
    if len(nodes) != 1 or len(nodes[0]) != _FULL_NODE_LENGTH:
        raise ValidationFailure(f"Revision must resolve to a single changeset: {revision}")
    if nodes[0] == _NULL_NODE:
        # The null changeset is an ancestor of everything; never a valid merge end.
        raise ValidationFailure(f"Revision must be a real changeset: {revision}")
    return nodes[0]


async def verify_landed_merge(
    command_runner: HgCommandRunner,
    *,
    repository_path: Path,
    source_revision: str,
    target_revision: str,
) -> str:
    """Return the full target node if source is contained in target's history.

    Raises ValidationFailure if a revision is unknown or ambiguous, or
    ConflictError if the source has not been merged into the target.
    """
    source_node = await _resolve_single_node(
        command_runner, repository_path=repository_path, revision=source_revision
    )
    target_node = await _resolve_single_node(
        command_runner, repository_path=repository_path, revision=target_revision
    )
    # The DAG range source::target is non-empty iff source is an ancestor of
    # (or equal to) target — i.e. the source changes already landed in target.
    # The nodes are canonical 40-hex, so the revset carries no user input.
    # -l 1 bounds output: we only need to know the DAG range is non-empty.
    range_result = await command_runner.run(
        ["log", "-r", f"{source_node}::{target_node}", "-l", "1", "-T", "{node}\n"],
        repository_path=repository_path,
    )
    landed = any(line for line in range_result.stdout.decode("utf-8", "replace").split("\n"))
    if not landed:
        raise ConflictError(
            "Source has not been merged into the target branch; push the merge first."
        )
    return target_node
