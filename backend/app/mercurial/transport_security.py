"""Process-wide hardening of the embedded Mercurial server.

Mercurial accepts several bundle2 parts on ``unbundle`` that a forge server must
never apply to a hosted repository:

* ``stream2`` / ``stream3-exp`` write raw store files into an empty repo via
  ``repo.lock()`` **without** opening a transaction, so they bypass the
  ``pretxnchangegroup``/``changegroup`` deny hooks entirely (audit C12).
* ``remote-changegroup`` makes the server fetch an attacker-supplied URL before
  the transaction opens — a server-side request forgery vector (audit C14).

Removing the handlers makes an incoming part of these types abort the unbundle
with "missing support for <part>". Serving stream *clones* to clients is
unaffected: that path uses the bundle generator mapping, not the part handlers.
"""

from __future__ import annotations

# Parts a forge server must refuse to apply on an incoming unbundle (push).
_FORBIDDEN_UNBUNDLE_PARTS = (b"remote-changegroup", b"stream2", b"stream3-exp")


def harden_bundle2_part_handlers() -> None:
    """Remove dangerous bundle2 unbundle part handlers. Idempotent."""
    # Importing this module populates ``bundle2.parthandlermapping`` via the
    # ``@parthandler`` decorators.
    import mercurial.bundle2_part_handlers  # noqa: F401
    from mercurial import bundle2

    for part in _FORBIDDEN_UNBUNDLE_PARTS:
        bundle2.parthandlermapping.pop(part, None)
