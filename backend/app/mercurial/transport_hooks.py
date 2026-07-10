from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from uuid import uuid4

from mercurial import error


def deny_read_only_write(*, ui, repo, hooktype, **kwargs) -> bool:
    permission = ui.config(b"revforge", b"transport_permission", b"read")
    if permission != b"write":
        raise error.Abort(b"write access required")
    return False


def spool_push_event(*, ui, repo, hooktype, node=None, source=None, url=None, **kwargs) -> bool:
    spool_dir = os.environ.get("REVFORGE_EVENT_SPOOL_DIR")
    if not spool_dir:
        return False
    try:
        os.makedirs(spool_dir, exist_ok=True)

        repository_id = os.environ.get("REVFORGE_REPOSITORY_ID", "unknown")
        actor_user_id = os.environ.get("REVFORGE_ACTOR_USER_ID")
        authentication_method = os.environ.get("REVFORGE_AUTH_METHOD", "unknown")
        credential_id = os.environ.get("REVFORGE_CREDENTIAL_ID")
        source_ip = os.environ.get("REVFORGE_SOURCE_IP", "unknown")
        request_id = os.environ.get("REVFORGE_REQUEST_ID", str(uuid4()))

        pushed_nodes = []
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

        event_path = os.path.join(spool_dir, f"{uuid4().hex}.json")
        with open(event_path, "w") as f:
            json.dump(event, f)
    except Exception:
        pass
    return False