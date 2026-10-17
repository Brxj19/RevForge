from __future__ import annotations

import json
import os
import re
import sys
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from mercurial import error

from app.core.request_id import safe_request_id

# I13: the spool records the whole pushed range, oldest first, capped.
MAX_PUSHED_NODES = 1000
_FULL_NODE_RE = re.compile(r"^[0-9a-f]{40}$")


def deny_read_only_write(*, ui: Any, repo: Any, hooktype: bytes, **kwargs: Any) -> bool:
    permission = ui.config(b"revforge", b"transport_permission", b"read")
    if permission != b"write":
        raise error.Abort(b"write access required")
    return False


def _as_text(value: bytes | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("ascii")
        except UnicodeDecodeError:
            return None
    return value


def pushed_range(
    repo: Any, node: bytes | str | None, node_last: bytes | str | None, *, cap: int
) -> tuple[list[str], int, bool]:
    """(nodes oldest->newest capped at ``cap``, true count, truncated) for a changegroup.

    The changegroup hook's ``node`` is the first added changeset and ``node_last`` the last;
    the added revisions are contiguous in the (unfiltered) changelog.
    """
    first = _as_text(node)
    last = _as_text(node_last) or first
    if first is None or not _FULL_NODE_RE.fullmatch(first):
        return [], 0, False
    if last is None or not _FULL_NODE_RE.fullmatch(last):
        return [first], 1, False
    changelog = repo.unfiltered().changelog
    first_rev = int(changelog.rev(bytes.fromhex(first)))
    last_rev = int(changelog.rev(bytes.fromhex(last)))
    if last_rev < first_rev:
        return [first], 1, False
    count = last_rev - first_rev + 1
    nodes = [
        changelog.node(rev).hex()
        for rev in range(first_rev, min(last_rev, first_rev + cap - 1) + 1)
    ]
    return [str(item) for item in nodes], count, count > len(nodes)


def spool_push_event(
    *,
    ui: Any,
    repo: Any,
    hooktype: bytes,
    node: bytes | str | None = None,
    node_last: bytes | str | None = None,
    source: bytes | None = None,
    url: bytes | None = None,
    **kwargs: Any,
) -> bool:
    spool_dir = ui.config(b"revforge", b"event_spool_dir")
    if not spool_dir:
        return False
    try:
        spool_dir = spool_dir.decode("utf-8")
        os.makedirs(spool_dir, exist_ok=True)

        repository_id = ui.config(b"revforge", b"repository_id", b"unknown").decode("utf-8")
        actor_user_id = ui.config(b"revforge", b"actor_user_id")
        actor_user_id = actor_user_id.decode("utf-8") if actor_user_id else None
        authentication_method = ui.config(b"revforge", b"auth_method", b"unknown").decode("utf-8")
        credential_id = ui.config(b"revforge", b"credential_id")
        credential_id = credential_id.decode("utf-8") if credential_id else None
        source_ip = ui.config(b"revforge", b"source_ip", b"unknown").decode("utf-8")
        # Re-validated here: the gateways should already have, but the hook is the last
        # point before a value is persisted.
        request_id = safe_request_id(ui.config(b"revforge", b"request_id"))

        try:
            pushed_nodes, pushed_count, truncated = pushed_range(
                repo, node, node_last, cap=MAX_PUSHED_NODES
            )
        except Exception as exc:
            # Never fail (or lose) the push event over range computation.
            print(f"revforge: push range unavailable ({type(exc).__name__})", file=sys.stderr)
            first = _as_text(node)
            valid = first is not None and _FULL_NODE_RE.fullmatch(first) is not None
            pushed_nodes = [first] if valid and first is not None else []
            pushed_count, truncated = len(pushed_nodes), False

        event = {
            "event_type": "repository.push.accepted",
            "repository_id": repository_id,
            "actor_user_id": actor_user_id,
            "authentication_method": authentication_method,
            "credential_id": credential_id,
            "source_ip": source_ip,
            "request_id": request_id,
            "pushed_nodes": pushed_nodes,
            "pushed_count": pushed_count,
            "pushed_nodes_truncated": truncated,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Write to a temp name then atomically rename so the worker never reads a
        # partially written .json (which it would treat as corrupt and delete).
        name = uuid4().hex
        event_path = os.path.join(spool_dir, f"{name}.json")
        tmp_path = os.path.join(spool_dir, f"{name}.json.tmp")
        with open(tmp_path, "w") as f:
            json.dump(event, f)
        os.replace(tmp_path, event_path)
    except Exception as exc:
        # The push already succeeded; report only the exception type (no paths/secrets).
        print(f"revforge: push event not recorded ({type(exc).__name__})", file=sys.stderr)
    return False
