"""Startup guard: the hg CLI and the imported Mercurial library must be the same release (I38).

RevForge reads repositories in-process (``import mercurial``) and through the ``hg``
executable (annotate, cat, diff, init, verify). If the two come from different releases
(for example a distro ``apt install mercurial`` beside the uv-locked wheel), repository
format requirements, template output and error text can silently diverge. The supported
range is documented in ``docs/operations/mercurial-version.md``.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from mercurial import util as hgutil

from app.core.config import Settings

from .command_runner import HgCommandRunner
from .errors import MercurialError

# Keep in sync with backend/pyproject.toml (`mercurial>=7.2,<7.3`).
SUPPORTED_MERCURIAL_SERIES = (7, 2)


class MercurialVersionMismatchError(MercurialError):
    """The hg CLI and the Mercurial library disagree, or are outside the supported series."""


def library_version() -> str:
    raw = hgutil.version()
    return raw.decode("ascii", errors="replace") if isinstance(raw, bytes) else str(raw)


def _series(version: str) -> tuple[int, int] | None:
    parts = version.split("+", 1)[0].split(".")
    try:
        return int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        return None


async def cli_version(settings: Settings) -> str:
    runner = HgCommandRunner(settings)
    with tempfile.TemporaryDirectory(prefix="revforge-hgver-") as scratch:
        try:
            result = await runner.run(
                ["version", "-T", "{ver}"], cwd=Path(scratch), stdout_limit=256
            )
        except MercurialError as exc:
            raise MercurialVersionMismatchError("hg_version_unavailable") from exc
    return result.stdout.decode("ascii", errors="replace").strip()


async def ensure_mercurial_versions_match(settings: Settings) -> str:
    """Raise unless CLI version == library version and both are in the supported series.

    Returns the verified version string. Never prints: the SSH gateway shares this module
    and nothing may reach stdout before the protocol server starts.
    """
    library = library_version()
    cli = await cli_version(settings)
    if cli != library:
        raise MercurialVersionMismatchError(f"hg CLI {cli!r} != Mercurial library {library!r}")
    if _series(library) != SUPPORTED_MERCURIAL_SERIES:
        raise MercurialVersionMismatchError(
            f"Mercurial {library!r} is outside the supported "
            f"{SUPPORTED_MERCURIAL_SERIES[0]}.{SUPPORTED_MERCURIAL_SERIES[1]}.x series"
        )
    return library
