from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from mercurial import error


def deny_read_only_write(*, ui: Any, repo: Any, hooktype: bytes, **kwargs: Any) -> bool:
    permission = ui.config(b"revforge", b"transport_permission", b"read")
    if permission != b"write":
        raise error.Abort(b"write access required")
    return False


def spool_push_event(
    *,
    ui: Any,
    repo: Any,
    hooktype: bytes,
    node: bytes | str | None = None,
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
        request_id = ui.config(b"revforge", b"request_id", str(uuid4()).encode()).decode("utf-8")

        pushed_nodes: list[str] = []
        if node:
            pushed_nodes.append(node.decode("utf-8") if isinstance(node, bytes) else node)

        event = {
            "event_type": "repository.push.accepted",
            "repository_id": repository_id,
            "actor_user_id": actor_user_id,
            "authentication_method": authentication_method,
            "credential_id": credential_id,
            "source_ip": source_ip,
            "request_id": request_id,
            "pushed_nodes": pushed_nodes,
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
    except Exception:
        pass
    return False
