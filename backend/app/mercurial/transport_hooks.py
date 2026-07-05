from __future__ import annotations

from mercurial import error


def deny_read_only_write(*, ui, repo, hooktype, **kwargs) -> bool:
    permission = ui.config(b"revforge", b"transport_permission", b"read")
    if permission != b"write":
        raise error.Abort(b"write access required")
    return False
