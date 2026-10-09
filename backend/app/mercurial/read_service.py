from __future__ import annotations

import asyncio
import mimetypes
import re
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from mercurial import error as hgerror
from mercurial import hg, initialization, scmutil
from mercurial import ui as uimod
from mercurial.node import hex as hg_hex
from mercurial.node import nullid, wdirid

from app.core.config import Settings

from .command_runner import HgCommandRunner
from .errors import (
    ContentTooLargeError,
    HgCommandFailedError,
    HgCommandOutputLimitError,
    InvalidRepositoryPathError,
    InvalidRevisionError,
    InvalidSearchQueryError,
    MercurialNotFoundError,
    RevisionAmbiguousError,
    RevisionNotFoundError,
)
from .languages import FONT_EXTENSIONS, IMAGE_EXTENSIONS, detect_language, extension_of
from .schemas import (
    ContentKind,
    HgBlame,
    HgBlameLine,
    HgChangedFile,
    HgChangeset,
    HgChangesetPage,
    HgChangesetRef,
    HgChangesetStats,
    HgCodeSearchMatch,
    HgCodeSearchResult,
    HgDiff,
    HgDirectoryBrowse,
    HgFileBrowse,
    HgFileSearchMatch,
    HgLanguageShare,
    HgRawFile,
    HgReference,
    HgReferences,
    HgRepositoryStats,
    HgTreeEntry,
    mercurial_timestamp,
)
from .work_limiter import HgWorkLimiter

FULL_NODE_RE = re.compile(r"^[0-9a-f]{40}$")
SAFE_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$")
# I11: short hashes are accepted from 6 hex digits. Shorter all-hex input that is not a ref
# name is rejected (422) rather than guessed at; decimal revision numbers are never used.
HEX_PREFIX_RE = re.compile(r"^[0-9a-f]{6,39}$")
SHORT_HEX_RE = re.compile(r"^[0-9a-f]{1,5}$")
DIFFSTAT_SUMMARY_RE = re.compile(
    r"^\s*(?P<files>\d+)\s+files?\s+changed"
    r"(?:,\s*(?P<insertions>\d+)\s+insertions?\(\+\))?"
    r"(?:,\s*(?P<deletions>\d+)\s+deletions?\(-\))?\s*$"
)
DIFFSTAT_PER_FILE_FALLBACK_LIMIT = 200
# `{diffstat}` renders as "<files>: +<insertions>/-<deletions>".
DIFFSTAT_TEMPLATE_RE = re.compile(r"^(?P<files>\d+):\s*\+(?P<insertions>\d+)/-(?P<deletions>\d+)$")

CODE_SEARCH_MAX_MATCHES = 100
CODE_SEARCH_SNIPPET_CHARS = 300
CODE_SEARCH_MAX_RANGES_PER_LINE = 20
STATS_MAX_LANGUAGES = 8
STATS_OTHER_COLOR = "#8b949e"

_INLINE_IMAGE_TYPES: dict[str, tuple[str, tuple[bytes, ...]]] = {
    "png": ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    "jpg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "jpeg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "gif": ("image/gif", (b"GIF87a", b"GIF89a")),
    "webp": ("image/webp", (b"RIFF",)),
}

initialization.init()


class _LRUCache[K: Hashable, V]:
    """Small thread-safe LRU; values are keyed by immutable changeset nodes."""

    def __init__(self, maxsize: int) -> None:
        self._maxsize = maxsize
        self._data: OrderedDict[K, V] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: K) -> V | None:
        with self._lock:
            value = self._data.get(key)
            if value is not None:
                self._data.move_to_end(key)
            return value

    def put(self, key: K, value: V) -> None:
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_TREE_CACHE: _LRUCache[tuple[str, str, str], tuple[HgTreeEntry, ...]] = _LRUCache(256)
_STATS_CACHE: _LRUCache[tuple[str, str], HgRepositoryStats] = _LRUCache(128)

_limiter_lock = threading.Lock()
_work_limiter: HgWorkLimiter | None = None


def get_work_limiter(settings: Settings) -> HgWorkLimiter:
    """Process-wide limiter shared by every request's read service."""
    global _work_limiter
    with _limiter_lock:
        if _work_limiter is None:
            _work_limiter = HgWorkLimiter(
                max_global=settings.hg_max_concurrent_operations,
                max_per_repository=settings.hg_max_concurrent_per_repository,
                acquire_timeout=float(settings.hg_command_timeout_seconds),
            )
        return _work_limiter


def reset_read_caches() -> None:
    """Drop process-wide caches and the limiter (tests and settings reloads)."""
    global _work_limiter
    _TREE_CACHE.clear()
    _STATS_CACHE.clear()
    with _limiter_lock:
        _work_limiter = None


@dataclass(slots=True)
class _FileProbe:
    node: str
    path: str
    size: int
    is_link: bool
    link_target: bytes | None
    content_kind: ContentKind
    is_too_large: bool


class MercurialReadService:
    def __init__(
        self,
        *,
        settings: Settings,
        command_runner: HgCommandRunner,
        limiter: HgWorkLimiter | None = None,
    ) -> None:
        self._settings = settings
        self._command_runner = command_runner
        self._limiter = limiter or get_work_limiter(settings)

    # ------------------------------------------------------------------ execution helpers

    async def _in_thread[**P, T](
        self, repository_path: Path, fn: Callable[P, T], *args: P.args, **kwargs: P.kwargs
    ) -> T:
        """Run blocking Mercurial library work off the event loop under a work slot."""
        async with self._limiter.slot(str(repository_path)):
            return await asyncio.to_thread(fn, *args, **kwargs)

    async def _run(self, args: list[str], *, repository_path: Path, stdout_limit: int) -> Any:
        async with self._limiter.slot(str(repository_path)):
            return await self._command_runner.run(
                args, repository_path=repository_path, stdout_limit=stdout_limit
            )

    async def _run_json(
        self, args: list[str], *, repository_path: Path, stdout_limit: int | None = None
    ) -> list[dict[str, Any]]:
        async with self._limiter.slot(str(repository_path)):
            return await self._command_runner.run_json(
                args, repository_path=repository_path, stdout_limit=stdout_limit
            )

    # ------------------------------------------------------------------ history

    async def list_changesets(
        self, repository_path: Path, *, cursor: str | None, limit: int | None = None
    ) -> HgChangesetPage:
        page_size = limit if limit is not None else self._settings.max_history_page_size
        changesets = await self._in_thread(
            repository_path, self._sync_list_changesets, repository_path, cursor, page_size
        )
        page = changesets[:page_size]
        next_cursor = changesets[page_size - 1].node if len(changesets) > page_size else None
        # Summary diffstats for the shown page in a single `hg log` call (audit C10).
        summaries = await self._load_diffstat_summaries(
            repository_path, [changeset.node for changeset in page]
        )
        for changeset in page:
            changeset.stats = summaries.get(changeset.node)
        return HgChangesetPage(changesets=page, next_cursor=next_cursor)

    def _sync_list_changesets(
        self, repository_path: Path, cursor: str | None, page_size: int
    ) -> list[HgChangeset]:
        repo = self._open_repository(repository_path)
        changelog = repo.changelog
        tiprev = changelog.tiprev()
        if tiprev < 0:
            return []
        if cursor is None:
            start_revision = tiprev
        else:
            start_revision = self._resolve_context(repo, cursor).rev() - 1
        if start_revision < 0:
            return []
        # `changelog.revs(start, stop)` yields nonexistent revisions when start > tiprev.
        start_revision = min(start_revision, tiprev)
        result: list[HgChangeset] = []
        for revision in changelog.revs(start=start_revision, stop=0):
            result.append(self._parse_changeset_context(repo[revision], include_files=True))
            if len(result) > page_size:
                break
        return result

    async def get_changeset(self, repository_path: Path, revision: str) -> HgChangeset:
        changeset = await self._in_thread(
            repository_path, self._sync_get_changeset, repository_path, revision
        )
        changeset.stats = await self._load_changeset_stats(repository_path, changeset.node)
        return changeset

    def _sync_get_changeset(self, repository_path: Path, revision: str) -> HgChangeset:
        repo = self._open_repository(repository_path)
        return self._parse_changeset_context(
            self._resolve_context(repo, revision), include_files=True
        )

    async def get_diff(self, repository_path: Path, revision: str) -> HgDiff:
        node = await self.resolve_revision(repository_path, revision)
        try:
            result = await self._run(
                ["diff", "--git", "-c", node],
                repository_path=repository_path,
                stdout_limit=self._settings.max_diff_bytes,
            )
            return HgDiff(
                content=result.stdout.decode("utf-8", errors="replace"),
                is_truncated=False,
                truncation_reason=None,
            )
        except HgCommandOutputLimitError as exc:
            return HgDiff(
                content=exc.stdout.decode("utf-8", errors="replace"),
                is_truncated=True,
                truncation_reason="diff_too_large",
            )

    # ------------------------------------------------------------------ browse

    async def browse(
        self, repository_path: Path, *, revision: str | None, path: str | None
    ) -> HgDirectoryBrowse | HgFileBrowse:
        normalized_path = validate_repository_relative_path(path)
        outcome = await self._in_thread(
            repository_path, self._sync_browse, repository_path, revision, normalized_path
        )
        if isinstance(outcome, HgDirectoryBrowse):
            return outcome
        return await self._read_file(repository_path, outcome)

    def _sync_browse(
        self, repository_path: Path, revision: str | None, normalized_path: str
    ) -> HgDirectoryBrowse | _FileProbe:
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            if normalized_path != "":
                raise MercurialNotFoundError()
            return HgDirectoryBrowse(revision="", path="", entries=[])
        node = _decode_ascii_bytes(ctx.hex())
        manifest = ctx.manifest()
        path_bytes = _encode_path(normalized_path)
        if normalized_path != "" and path_bytes in manifest:
            return self._probe_file(ctx, manifest, path_bytes, node=node, path=normalized_path)
        if normalized_path != "" and not manifest.hasdir(path_bytes):
            raise MercurialNotFoundError()
        return HgDirectoryBrowse(
            revision=node,
            path=normalized_path,
            entries=list(
                self._directory_entries(
                    repository_path, ctx, manifest, node=node, directory=normalized_path
                )
            ),
        )

    def _probe_file(
        self, ctx: Any, manifest: Any, path_bytes: bytes, *, node: str, path: str
    ) -> _FileProbe:
        fctx = ctx.filectx(path_bytes, fileid=manifest[path_bytes])
        is_link = b"l" in manifest.flags(path_bytes)
        size = int(fctx.size())
        extension = extension_of(path)
        content_kind: ContentKind = "text"
        if is_link:
            content_kind = "symlink"
        elif extension in IMAGE_EXTENSIONS:
            content_kind = "image"
        elif extension in FONT_EXTENSIONS:
            content_kind = "font"
        return _FileProbe(
            node=node,
            path=path,
            size=size,
            is_link=is_link,
            # A link target is a short path string; read it in-process.
            link_target=bytes(fctx.data()) if is_link else None,
            content_kind=content_kind,
            # Decided from the stored size before any `hg cat` (no oversized reads).
            is_too_large=size > self._settings.max_file_content_bytes,
        )

    async def _read_file(self, repository_path: Path, probe: _FileProbe) -> HgFileBrowse:
        language = _language_name(probe.path)

        def result(
            *, content: str | None, kind: ContentKind, is_binary: bool, too_large: bool = False
        ) -> HgFileBrowse:
            return HgFileBrowse(
                revision=probe.node,
                path=probe.path,
                content=content,
                language_hint=_language_hint(probe.path),
                is_binary=is_binary,
                is_too_large=too_large,
                size_when_known=probe.size,
                content_kind=kind,
                language=language,
            )

        if probe.content_kind == "symlink":
            target = (probe.link_target or b"").decode("utf-8", errors="replace")
            return result(content=target, kind="symlink", is_binary=False)
        if probe.content_kind in {"image", "font"}:
            return result(content=None, kind=probe.content_kind, is_binary=True)
        if probe.is_too_large:
            return result(content=None, kind="text", is_binary=False, too_large=True)

        try:
            output = await self._run(
                ["cat", "-r", probe.node, "--", _literal_pathspec(probe.path)],
                repository_path=repository_path,
                stdout_limit=self._settings.max_file_content_bytes,
            )
        except HgCommandOutputLimitError:
            return result(content=None, kind="text", is_binary=False, too_large=True)
        except HgCommandFailedError as exc:
            if exc.code == "hg_missing_path":
                raise MercurialNotFoundError() from exc
            raise

        data: bytes = output.stdout
        if _looks_binary(data):
            return result(content=None, kind="binary", is_binary=True)
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            return result(content=None, kind="binary", is_binary=True)
        return result(content=content, kind="text", is_binary=False)

    def _directory_entries(
        self,
        repository_path: Path,
        ctx: Any,
        manifest: Any,
        *,
        node: str,
        directory: str,
    ) -> tuple[HgTreeEntry, ...]:
        cache_key = (str(repository_path), node, directory)
        cached = _TREE_CACHE.get(cache_key)
        if cached is not None:
            return cached

        prefix = _encode_path(f"{directory}/") if directory else b""
        kinds: dict[bytes, str] = {}
        subtree_files: dict[bytes, list[bytes]] = {}
        for manifest_path in manifest.keys():
            if prefix and not manifest_path.startswith(prefix):
                continue
            remainder = manifest_path[len(prefix) :]
            if not remainder:
                continue
            head, separator, _tail = remainder.partition(b"/")
            kind = "directory" if separator else "file"
            kinds.setdefault(head, kind)
            subtree_files.setdefault(head, []).append(manifest_path)

        total_files = sum(len(paths) for paths in subtree_files.values())
        compute_last = total_files <= self._settings.tree_last_changeset_file_cap
        changelog_refs: dict[int, HgChangesetRef] = {}
        repo = ctx.repo()

        def changeset_ref(revision: int) -> HgChangesetRef:
            ref = changelog_refs.get(revision)
            if ref is None:
                entry_ctx = repo[revision]
                entry_node = _decode_ascii_bytes(entry_ctx.hex())
                author_name, _email = _parse_author(_decode_display(entry_ctx.user()))
                ref = HgChangesetRef(
                    node=entry_node,
                    short_node=entry_node[:12],
                    summary=_first_line(_decode_display(entry_ctx.description())),
                    author_name=author_name,
                    date=mercurial_timestamp(list(entry_ctx.date())),
                )
                changelog_refs[revision] = ref
            return ref

        entries: list[HgTreeEntry] = []
        for head, kind in kinds.items():
            child_path = (prefix + head).decode("utf-8", errors="replace")
            size: int | None = None
            if kind == "file":
                file_path = prefix + head
                size = int(ctx.filectx(file_path, fileid=manifest[file_path]).size())
            last: HgChangesetRef | None = None
            if compute_last:
                newest = max(
                    int(ctx.filectx(path, fileid=manifest[path]).introrev())
                    for path in subtree_files[head]
                )
                last = changeset_ref(newest)
            entries.append(
                HgTreeEntry(
                    name=head.decode("utf-8", errors="replace"),
                    path=child_path,
                    kind=kind,
                    size=size,
                    last_changeset=last,
                )
            )
        ordered = tuple(sorted(entries, key=lambda entry: (entry.kind != "directory", entry.name)))
        _TREE_CACHE.put(cache_key, ordered)
        return ordered

    # ------------------------------------------------------------------ raw

    async def read_raw(
        self, repository_path: Path, *, revision: str | None, path: str
    ) -> HgRawFile:
        normalized_path = validate_repository_relative_path(path)
        if normalized_path == "":
            raise MercurialNotFoundError()
        probe = await self._in_thread(
            repository_path, self._sync_raw_probe, repository_path, revision, normalized_path
        )
        if probe.is_link:
            return HgRawFile(revision=probe.node, path=probe.path, data=probe.link_target or b"")
        try:
            output = await self._run(
                ["cat", "-r", probe.node, "--", _literal_pathspec(probe.path)],
                repository_path=repository_path,
                stdout_limit=self._settings.max_raw_bytes,
            )
        except HgCommandOutputLimitError as exc:
            raise ContentTooLargeError() from exc
        except HgCommandFailedError as exc:
            if exc.code == "hg_missing_path":
                raise MercurialNotFoundError() from exc
            raise
        return HgRawFile(revision=probe.node, path=probe.path, data=output.stdout)

    def _sync_raw_probe(
        self, repository_path: Path, revision: str | None, normalized_path: str
    ) -> _FileProbe:
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            raise MercurialNotFoundError()
        manifest = ctx.manifest()
        path_bytes = _encode_path(normalized_path)
        # Directories (and anything else that is not a manifest file) are 404.
        if path_bytes not in manifest:
            raise MercurialNotFoundError()
        probe = self._probe_file(
            ctx,
            manifest,
            path_bytes,
            node=_decode_ascii_bytes(ctx.hex()),
            path=normalized_path,
        )
        if probe.size > self._settings.max_raw_bytes:
            raise ContentTooLargeError()
        return probe

    # ------------------------------------------------------------------ blame

    async def get_blame(self, repository_path: Path, *, revision: str | None, path: str) -> HgBlame:
        normalized_path = validate_repository_relative_path(path)
        if normalized_path == "":
            raise MercurialNotFoundError()
        probe = await self._in_thread(
            repository_path, self._sync_blame_probe, repository_path, revision, normalized_path
        )
        node, verdict = probe
        if verdict == "too_large":
            return HgBlame(revision=node, path=normalized_path, lines=[], is_too_large=True)
        if verdict == "binary":
            return HgBlame(revision=node, path=normalized_path, lines=[], is_binary=True)
        try:
            payload = await self._run_json(
                [
                    "annotate",
                    "-Tjson",
                    "-u",
                    "-n",
                    "-f",
                    "-d",
                    "-l",
                    "-c",
                    "-r",
                    node,
                    "--",
                    _literal_pathspec(normalized_path),
                ],
                repository_path=repository_path,
                stdout_limit=max(
                    self._settings.max_file_content_bytes * 8,
                    self._settings.hg_max_stdout_bytes,
                ),
            )
        except HgCommandOutputLimitError:
            return HgBlame(revision=node, path=normalized_path, lines=[], is_too_large=True)
        except HgCommandFailedError as exc:
            if exc.code == "hg_missing_path":
                raise MercurialNotFoundError() from exc
            raise

        if not payload:
            raise MercurialNotFoundError()

        lines_payload = payload[0].get("lines", [])
        nodes = sorted({str(entry["node"]) for entry in lines_payload})
        summaries = await self._in_thread(
            repository_path, self._sync_summaries, repository_path, nodes
        )
        lines: list[HgBlameLine] = []
        for index, entry in enumerate(lines_payload, start=1):
            author_name, author_email = _parse_author(str(entry["user"]))
            full_node = str(entry["node"])
            raw_date = entry.get("date")
            lines.append(
                HgBlameLine(
                    line_number=index,
                    revision=full_node,
                    short_revision=full_node[:12],
                    author_name=author_name,
                    author_email_when_available=author_email,
                    path=str(entry["path"]),
                    content=str(entry["line"]).rstrip("\n"),
                    origin_line=int(entry["lineno"]) if "lineno" in entry else None,
                    date=mercurial_timestamp(raw_date) if raw_date else None,
                    summary=summaries.get(full_node, ""),
                )
            )
        return HgBlame(revision=node, path=normalized_path, lines=lines)

    def _sync_blame_probe(
        self, repository_path: Path, revision: str | None, normalized_path: str
    ) -> tuple[str, str]:
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            raise MercurialNotFoundError()
        node = _decode_ascii_bytes(ctx.hex())
        manifest = ctx.manifest()
        path_bytes = _encode_path(normalized_path)
        if path_bytes not in manifest:
            raise MercurialNotFoundError()
        fctx = ctx.filectx(path_bytes, fileid=manifest[path_bytes])
        if int(fctx.size()) > self._settings.max_file_content_bytes:
            return node, "too_large"
        if b"l" in manifest.flags(path_bytes) or _looks_binary(bytes(fctx.data())):
            return node, "binary"
        return node, "text"

    def _sync_summaries(self, repository_path: Path, nodes: list[str]) -> dict[str, str]:
        repo = self._open_repository(repository_path)
        summaries: dict[str, str] = {}
        for node in nodes:
            if not FULL_NODE_RE.fullmatch(node):
                continue
            try:
                summaries[node] = _first_line(
                    _decode_display(repo[bytes.fromhex(node)].description())
                )
            except (hgerror.LookupError, hgerror.RepoLookupError):
                continue
        return summaries

    # ------------------------------------------------------------------ search

    async def search_files(
        self,
        repository_path: Path,
        *,
        revision: str | None,
        query: str,
        limit: int = 50,
    ) -> tuple[str, list[HgFileSearchMatch]]:
        return await self._in_thread(
            repository_path,
            self._sync_search_files,
            repository_path,
            revision,
            query,
            limit,
        )

    def _sync_search_files(
        self, repository_path: Path, revision: str | None, query: str, limit: int
    ) -> tuple[str, list[HgFileSearchMatch]]:
        normalized_query = query.strip().lower()
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            return "", []
        node = _decode_ascii_bytes(ctx.hex())
        if not normalized_query:
            return node, []
        files = self._manifest_paths(ctx)
        ranked = sorted(
            (path for path in files if normalized_query in path.lower()),
            key=lambda path: (not path.lower().startswith(normalized_query), len(path), path),
        )[:limit]
        return node, [
            HgFileSearchMatch(path=path, language_hint=_language_hint(path)) for path in ranked
        ]

    async def search_code(
        self,
        repository_path: Path,
        *,
        revision: str | None,
        query: str,
        limit: int = 50,
    ) -> HgCodeSearchResult:
        validate_code_search_query(query)
        bounded_limit = max(1, min(limit, CODE_SEARCH_MAX_MATCHES))
        return await self._in_thread(
            repository_path,
            self._sync_search_code,
            repository_path,
            revision,
            query,
            bounded_limit,
        )

    def _sync_search_code(
        self, repository_path: Path, revision: str | None, query: str, limit: int
    ) -> HgCodeSearchResult:
        """Literal, case-insensitive search over one revision's manifest (no regex, no grep).

        Bounded by file count, total bytes, per-file size and wall-clock; any cap that stops
        the scan early sets ``truncated``.
        """
        deadline = time.monotonic() + self._settings.code_search_timeout_seconds
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            return HgCodeSearchResult(revision="", items=[], truncated=False)
        node = _decode_ascii_bytes(ctx.hex())
        needle = query.casefold()
        manifest = ctx.manifest()
        items: list[HgCodeSearchMatch] = []
        truncated = False
        files_scanned = 0
        bytes_scanned = 0

        for path_bytes in manifest.keys():
            if time.monotonic() > deadline or files_scanned >= self._settings.code_search_max_files:
                truncated = True
                break
            if b"l" in manifest.flags(path_bytes):
                continue
            fctx = ctx.filectx(path_bytes, fileid=manifest[path_bytes])
            size = int(fctx.size())
            if size > self._settings.code_search_max_file_bytes:
                continue
            if bytes_scanned + size > self._settings.code_search_max_total_bytes:
                truncated = True
                break
            data = bytes(fctx.data())
            files_scanned += 1
            bytes_scanned += len(data)
            if _looks_binary(data):
                continue
            text = data.decode("utf-8", errors="replace")
            if needle not in text.casefold():
                continue
            display_path = path_bytes.decode("utf-8", errors="replace")
            for line_number, raw_line in enumerate(text.split("\n"), start=1):
                line = raw_line.removesuffix("\r")
                ranges = _find_casefold_ranges(line, needle)
                if not ranges:
                    continue
                if len(items) >= limit:
                    truncated = True
                    break
                snippet, snippet_ranges = _snippet(line, ranges)
                items.append(
                    HgCodeSearchMatch(
                        path=display_path, line=line_number, text=snippet, ranges=snippet_ranges
                    )
                )
            if truncated:
                break
        return HgCodeSearchResult(revision=node, items=items, truncated=truncated)

    # ------------------------------------------------------------------ stats

    async def get_stats(self, repository_path: Path, *, revision: str | None) -> HgRepositoryStats:
        return await self._in_thread(repository_path, self._sync_stats, repository_path, revision)

    def _sync_stats(self, repository_path: Path, revision: str | None) -> HgRepositoryStats:
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            return HgRepositoryStats(
                revision="",
                languages=(),
                contributors=0,
                contributors_truncated=False,
                size_bytes=0,
            )
        node = _decode_ascii_bytes(ctx.hex())
        cache_key = (str(repository_path), node)
        cached = _STATS_CACHE.get(cache_key)
        if cached is not None:
            return cached
        stats = compute_repository_stats(
            repo, ctx, node=node, contributor_scan_cap=self._settings.stats_contributor_scan_cap
        )
        _STATS_CACHE.put(cache_key, stats)
        return stats

    # ------------------------------------------------------------------ refs

    async def list_refs(self, repository_path: Path) -> HgReferences:
        return await self._in_thread(repository_path, self._sync_list_refs, repository_path)

    def _sync_list_refs(self, repository_path: Path) -> HgReferences:
        """Branches, tags and bookmarks from the served view (secret changesets hidden)."""
        repo = self._open_repository(repository_path)
        changelog = repo.changelog

        def served_rev(node: bytes) -> int | None:
            try:
                return int(changelog.rev(node))
            except (hgerror.LookupError, hgerror.RepoLookupError, IndexError):
                return None

        def reference(name: bytes, node: bytes) -> HgReference:
            hex_node = _decode_ascii_bytes(hg_hex(node))
            return HgReference(name=_decode_display(name), node=hex_node, short_node=hex_node[:12])

        branchmap = repo.branchmap()
        branches: list[tuple[int, HgReference]] = []
        for name in branchmap:
            if not branchmap.branchheads(name, closed=False):
                continue  # closed branches are hidden, as in `hg branches`
            tip = branchmap.branchtip(name)
            rev = served_rev(tip)
            if rev is not None:
                branches.append((rev, reference(name, tip)))

        tags: list[tuple[int, HgReference]] = []
        for name, tag_node in repo.tagslist():
            if name == b"tip":
                continue
            rev = served_rev(tag_node)
            if rev is not None:
                tags.append((rev, reference(name, tag_node)))

        bookmarks: list[HgReference] = []
        for name, bookmark_node in sorted(repo._bookmarks.items()):
            if served_rev(bookmark_node) is not None:
                bookmarks.append(reference(name, bookmark_node))

        return HgReferences(
            branches=[ref for _rev, ref in sorted(branches, key=lambda item: -item[0])],
            tags=[ref for _rev, ref in sorted(tags, key=lambda item: -item[0])],
            bookmarks=bookmarks,
        )

    async def resolve_revision(self, repository_path: Path, revision: str | None) -> str:
        return await self._in_thread(
            repository_path, self._sync_resolve_revision, repository_path, revision
        )

    def _sync_resolve_revision(self, repository_path: Path, revision: str | None) -> str:
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            raise RevisionNotFoundError()
        return _decode_ascii_bytes(ctx.hex())

    # ------------------------------------------------------------------ repository access

    def _open_repository(self, repository_path: Path) -> Any:
        # A bare ui() reads no user/system hgrc (unlike ui.load()); only the repository's own
        # server-managed .hg/hgrc applies. The served view hides secret and obsolete
        # changesets, matching what hgweb and `hg serve` expose to clients.
        base_ui = uimod.ui()
        base_ui.setconfig(b"ui", b"nontty", b"true", b"revforge")
        base_ui.setconfig(b"ui", b"interactive", b"false", b"revforge")
        try:
            repo = hg.repository(base_ui, bytes(str(repository_path), "utf-8"))
        except (hgerror.RepoError, FileNotFoundError) as exc:
            raise MercurialNotFoundError() from exc
        return repo.filtered(b"served")

    def _default_or_requested_context(self, repo: Any, revision: str | None) -> Any:
        if repo.changelog.tiprev() < 0:
            return None
        if revision is None or revision == "":
            return repo[repo.changelog.tiprev()]
        return self._resolve_context(repo, revision)

    def _resolve_context(self, repo: Any, revision: str) -> Any:
        """Resolve user input to a served changeset. Never evaluates revsets.

        Order matches native hg name lookup: full node, bookmark, tag, branch (tip-most
        head), then an unambiguous hex prefix of at least 6 digits (I11).
        """
        if FULL_NODE_RE.fullmatch(revision):
            return self._context_for_node(repo, bytes.fromhex(revision))
        if not SAFE_REF_RE.fullmatch(revision):
            raise InvalidRevisionError()

        name = revision.encode("utf-8")
        bookmark_node = repo._bookmarks.get(name)
        if bookmark_node is not None:
            return self._context_for_node(repo, bookmark_node)

        tag_node = repo.tags().get(name)
        if tag_node is not None:
            return self._context_for_node(repo, tag_node)

        branch_tip = repo.branchtip(name, ignoremissing=True)
        if branch_tip is not None:
            return self._context_for_node(repo, branch_tip)

        if HEX_PREFIX_RE.fullmatch(revision):
            return self._context_for_node(repo, self._resolve_prefix(repo, revision))
        if SHORT_HEX_RE.fullmatch(revision):
            raise InvalidRevisionError()
        raise RevisionNotFoundError()

    def _resolve_prefix(self, repo: Any, prefix: str) -> bytes:
        try:
            node = scmutil.resolvehexnodeidprefix(repo, prefix.encode("ascii"))
        except hgerror.AmbiguousPrefixLookupError:
            # Mercurial checks ambiguity against the unfiltered changelog. Re-check within
            # the served view so hidden/secret changesets are neither revealed nor counted.
            return self._disambiguate_within_served(repo, prefix)
        except (hgerror.LookupError, hgerror.RepoLookupError, hgerror.WdirUnsupported) as exc:
            # FilteredLookupError: the only match is secret or obsolete.
            # WdirUnsupported: the prefix names the working-directory pseudo-node.
            raise RevisionNotFoundError() from exc
        if node is None:
            raise RevisionNotFoundError()
        return bytes(node)

    def _disambiguate_within_served(self, repo: Any, prefix: str) -> bytes:
        changelog = repo.changelog
        match: bytes | None = None
        for rev in changelog.revs():
            node = changelog.node(rev)
            if hg_hex(node).startswith(prefix.encode("ascii")):
                if match is not None:
                    raise RevisionAmbiguousError()
                match = node
        if match is None:
            raise RevisionNotFoundError()
        return bytes(match)

    def _context_for_node(self, repo: Any, node: bytes) -> Any:
        # `ffff...ff` (wdirid) names the working directory and `0000...00` (nullid) the empty
        # root; neither is a changeset a client may browse. Prefixes of `fff...` can also
        # resolve to wdirid, so the guard sits here rather than on the input string.
        if node in (wdirid, nullid):
            raise RevisionNotFoundError()
        try:
            ctx = repo[node]
        except (hgerror.LookupError, hgerror.RepoLookupError, KeyError, IndexError) as exc:
            raise RevisionNotFoundError() from exc
        revision = ctx.rev()
        if not isinstance(revision, int) or revision < 0:
            raise RevisionNotFoundError()
        return ctx

    def _manifest_paths(self, ctx: Any) -> list[str]:
        return [path.decode("utf-8", errors="replace") for path in ctx.manifest().keys()]

    def _parse_changeset_context(self, ctx: Any, *, include_files: bool) -> HgChangeset:
        node = _decode_ascii_bytes(ctx.hex())
        author_name, author_email = _parse_author(_decode_display(ctx.user()))
        return HgChangeset(
            node=node,
            short_node=node[:12],
            parents=[
                _decode_ascii_bytes(parent.hex()) for parent in ctx.parents() if parent.rev() >= 0
            ],
            author_name=author_name,
            author_email_when_available=author_email,
            timestamp=mercurial_timestamp(list(ctx.date())),
            message=_decode_display(ctx.description()),
            branch=_decode_display(ctx.branch()),
            tags=[_decode_display(tag) for tag in ctx.tags() if tag != b"tip"],
            bookmarks=[_decode_display(bookmark) for bookmark in ctx.bookmarks()],
            files_changed=(
                [_decode_display(path) for path in ctx.files()] if include_files else []
            ),
            revision_number=int(ctx.rev()),
        )

    # ------------------------------------------------------------------ diffstats

    async def _load_diffstat_summaries(
        self, repository_path: Path, nodes: list[str]
    ) -> dict[str, HgChangesetStats]:
        """Summary (files/insertions/deletions) for several changesets in one hg call."""
        if not nodes:
            return {}
        if not all(FULL_NODE_RE.fullmatch(node) for node in nodes):
            return {}
        revset = " or ".join(nodes)  # concrete 40-hex nodes only; nothing user-supplied
        try:
            result = await self._run(
                ["log", "-r", revset, "-T", "{node} {diffstat}\n"],
                repository_path=repository_path,
                stdout_limit=self._settings.hg_max_stdout_bytes,
            )
        except (HgCommandFailedError, HgCommandOutputLimitError):
            # Rare: the whole page falls back to file-count-only stats rather than
            # failing the history view.
            return {}
        summaries: dict[str, HgChangesetStats] = {}
        for line in result.stdout.decode("utf-8", errors="replace").splitlines():
            node, _, diffstat = line.partition(" ")
            match = DIFFSTAT_TEMPLATE_RE.match(diffstat.strip())
            if not node or match is None:
                continue
            summaries[node] = HgChangesetStats(
                files_changed=int(match.group("files")),
                insertions=int(match.group("insertions")),
                deletions=int(match.group("deletions")),
                changed_files=[],
            )
        return summaries

    async def _load_changeset_stats(
        self,
        repository_path: Path,
        node: str,
    ) -> HgChangesetStats | None:
        try:
            status_payload = await self._run_json(
                ["status", "--change", node, "--copies", "-Tjson"],
                repository_path=repository_path,
                stdout_limit=self._settings.hg_max_stdout_bytes,
            )
            diffstat_result = await self._run(
                ["diff", "--stat", "-c", node],
                repository_path=repository_path,
                stdout_limit=self._settings.hg_max_stdout_bytes,
            )
        except (HgCommandFailedError, HgCommandOutputLimitError):
            return None

        status_by_path: dict[str, tuple[str, str | None]] = {}
        for entry in status_payload:
            path = str(entry.get("path", ""))
            if not path:
                continue
            status = str(entry.get("status", "M")).lower()
            copy_source = entry.get("source")
            normalized_status = {
                "a": "added",
                "m": "modified",
                "r": "deleted",
                "!": "deleted",
                "?": "unknown",
                "c": "clean",
            }.get(status, "modified")
            if copy_source:
                normalized_status = "copied"
            status_by_path[path] = (
                normalized_status,
                str(copy_source) if copy_source is not None else None,
            )

        diffstat = _parse_diffstat_output(diffstat_result.stdout.decode("utf-8", errors="replace"))

        changed_files: list[HgChangedFile] = []
        try:
            diff_result = await self._run(
                ["diff", "--git", "-c", node],
                repository_path=repository_path,
                stdout_limit=self._settings.max_diff_bytes,
            )
        except (HgCommandFailedError, HgCommandOutputLimitError):
            diff_result = None

        if diff_result is not None:
            changed_files = _parse_changed_files_from_diff(
                diff_result.stdout.decode("utf-8", errors="replace")
            )

        for changed_file in changed_files:
            if changed_file.path in status_by_path:
                status, old_path = status_by_path[changed_file.path]
                changed_file.status = status
                changed_file.old_path = old_path
            elif changed_file.old_path and changed_file.old_path in status_by_path:
                status, _ = status_by_path[changed_file.old_path]
                changed_file.status = "renamed" if status == "deleted" else status

        if not changed_files and status_by_path:
            exact_file_stats: dict[str, tuple[int | None, int | None]] = {}
            if len(status_by_path) <= DIFFSTAT_PER_FILE_FALLBACK_LIMIT:
                exact_file_stats = await self._load_per_file_diffstats(
                    repository_path,
                    node=node,
                    paths=list(status_by_path.keys()),
                )
            changed_files = [
                HgChangedFile(
                    path=path,
                    status=status,
                    insertions=exact_file_stats.get(path, (None, None))[0],
                    deletions=exact_file_stats.get(path, (None, None))[1],
                    old_path=old_path,
                )
                for path, (status, old_path) in status_by_path.items()
                if status != "clean"
            ]

        files_changed = diffstat.files_changed
        if files_changed is None and changed_files:
            files_changed = len(changed_files)

        return HgChangesetStats(
            files_changed=files_changed,
            insertions=diffstat.insertions,
            deletions=diffstat.deletions,
            changed_files=changed_files,
        )

    async def _load_per_file_diffstats(
        self,
        repository_path: Path,
        *,
        node: str,
        paths: list[str],
    ) -> dict[str, tuple[int | None, int | None]]:
        stats_by_path: dict[str, tuple[int | None, int | None]] = {}

        for path in paths:
            try:
                result = await self._run(
                    ["diff", "--stat", "-c", node, "--", _literal_pathspec(path)],
                    repository_path=repository_path,
                    stdout_limit=self._settings.hg_max_stdout_bytes,
                )
            except (HgCommandFailedError, HgCommandOutputLimitError):
                continue

            diffstat = _parse_diffstat_output(result.stdout.decode("utf-8", errors="replace"))
            if diffstat.files_changed is None:
                continue

            stats_by_path[path] = (diffstat.insertions, diffstat.deletions)

        return stats_by_path


# ---------------------------------------------------------------------- stats computation


def compute_repository_stats(
    repo: Any, ctx: Any, *, node: str, contributor_scan_cap: int
) -> HgRepositoryStats:
    """Language byte shares and size of one revision's tree, plus distinct contributors.

    ``size_bytes`` is the total size of the files in that revision's manifest (not the
    on-disk store size), so it is stable per changeset and cacheable by node.
    """
    manifest = ctx.manifest()
    bytes_by_language: dict[str, int] = {}
    colors: dict[str, str] = {}
    secondary_bytes: dict[str, int] = {}
    total_size = 0
    for path_bytes in manifest.keys():
        size = int(ctx.filectx(path_bytes, fileid=manifest[path_bytes]).size())
        total_size += size
        if b"l" in manifest.flags(path_bytes):
            continue
        language = detect_language(path_bytes.decode("utf-8", errors="replace"))
        if language is None:
            continue
        colors[language.name] = language.color
        bucket = (
            bytes_by_language if language.kind in {"programming", "markup"} else (secondary_bytes)
        )
        bucket[language.name] = bucket.get(language.name, 0) + size

    # Like most forges, the bar shows code and markup; data/prose only when nothing else.
    shares_source = bytes_by_language or secondary_bytes
    languages = _language_shares(shares_source, colors)

    changelog = repo.changelog
    authors: set[str] = set()
    scanned = 0
    truncated = False
    for rev in changelog.ancestors([ctx.rev()], inclusive=True):
        if scanned >= contributor_scan_cap:
            truncated = True
            break
        scanned += 1
        name, email = _parse_author(_decode_display(changelog.changelogrevision(rev).user))
        authors.add((email or name).strip().lower())
    authors.discard("")

    return HgRepositoryStats(
        revision=node,
        languages=languages,
        contributors=len(authors),
        contributors_truncated=truncated,
        size_bytes=total_size,
    )


def _language_shares(
    bytes_by_language: dict[str, int], colors: dict[str, str]
) -> tuple[HgLanguageShare, ...]:
    total = sum(bytes_by_language.values())
    if total <= 0:
        return ()
    ranked = sorted(bytes_by_language.items(), key=lambda item: (-item[1], item[0]))
    head = ranked[:STATS_MAX_LANGUAGES]
    tail_bytes = sum(size for _name, size in ranked[STATS_MAX_LANGUAGES:])
    shares = [
        HgLanguageShare(name=name, percent=round(size * 100 / total, 1), color=colors[name])
        for name, size in head
    ]
    if tail_bytes:
        shares.append(
            HgLanguageShare(
                name="Other", percent=round(tail_bytes * 100 / total, 1), color=STATS_OTHER_COLOR
            )
        )
    return tuple(shares)


# ---------------------------------------------------------------------- input validation


def validate_code_search_query(query: str) -> str:
    if not 2 <= len(query) <= 200:
        raise InvalidSearchQueryError("query_length")
    if any(character in query for character in ("\x00", "\r", "\n")):
        raise InvalidSearchQueryError("query_characters")
    return query


def _literal_pathspec(normalized_path: str) -> str:
    """Return an hg pattern that matches exactly this path.

    hg treats bare file arguments as patterns even after ``--`` (``listfile:``,
    ``set:``, ``re:``, ``glob:`` prefixes), so a validated relative path must be
    passed with an explicit ``path:`` prefix to be interpreted literally
    (audit C4; see .claude/rules/mercurial.md).
    """
    return f"path:{normalized_path}"


def validate_repository_relative_path(value: str | None) -> str:
    if value is None or value == "":
        return ""
    if "\x00" in value or "\\" in value:
        raise InvalidRepositoryPathError()
    normalized = value.strip("/")
    if not normalized:
        return ""
    path = PurePosixPath(normalized)
    if path.is_absolute():
        raise InvalidRepositoryPathError()
    segments = normalized.split("/")
    if any(segment in {"", ".", ".."} for segment in segments):
        raise InvalidRepositoryPathError()
    if segments and segments[0] == ".hg":
        raise InvalidRepositoryPathError()
    if len(normalized) > 1024:
        raise InvalidRepositoryPathError()
    try:
        normalized.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise InvalidRepositoryPathError() from exc
    return normalized


def classify_raw_content(path: str, data: bytes) -> tuple[str, bool]:
    """Return (Content-Type, inline) for raw file bytes from a server-side allowlist.

    Only PNG/JPEG/GIF/WebP whose bytes match the format signature are served inline.
    Valid UTF-8 without NUL bytes is ``text/plain``; everything else (including HTML, SVG and
    XML, which are text) is never given an active content type.
    """
    image = _INLINE_IMAGE_TYPES.get(extension_of(path))
    if image is not None:
        content_type, signatures = image
        if any(data.startswith(signature) for signature in signatures) and (
            content_type != "image/webp" or data[8:12] == b"WEBP"
        ):
            return content_type, True
    if not _looks_binary(data):
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            pass
        else:
            return "text/plain; charset=utf-8", False
    return "application/octet-stream", False


def _encode_path(normalized_path: str) -> bytes:
    return normalized_path.encode("utf-8")


def _find_casefold_ranges(line: str, needle: str) -> list[tuple[int, int]]:
    """Case-insensitive literal matches of ``needle`` (already casefolded) in ``line``.

    Ranges are [start, end) offsets into the original line. Case folding can expand a
    character (e.g. "ß" -> "ss"), so offsets are mapped back through a per-character index.
    """
    folded = line.casefold()
    if needle not in folded:
        return []
    if len(folded) == len(line):
        index_map: list[int] | None = None
    else:
        index_map = []
        for original_index, character in enumerate(line):
            index_map.extend([original_index] * len(character.casefold()))
    ranges: list[tuple[int, int]] = []
    start = folded.find(needle)
    while start != -1 and len(ranges) < CODE_SEARCH_MAX_RANGES_PER_LINE:
        end = start + len(needle)
        if index_map is None:
            ranges.append((start, end))
        else:
            ranges.append((index_map[start], index_map[end - 1] + 1))
        start = folded.find(needle, end)
    return ranges


def _snippet(line: str, ranges: list[tuple[int, int]]) -> tuple[str, list[tuple[int, int]]]:
    if len(line) <= CODE_SEARCH_SNIPPET_CHARS:
        return line, ranges
    window_start = max(0, ranges[0][0] - CODE_SEARCH_SNIPPET_CHARS // 3)
    window_end = window_start + CODE_SEARCH_SNIPPET_CHARS
    clipped = [
        (max(start, window_start) - window_start, min(end, window_end) - window_start)
        for start, end in ranges
        if start < window_end and end > window_start
    ]
    return line[window_start:window_end], clipped


def _parse_author(raw_author: str) -> tuple[str, str | None]:
    if "<" in raw_author and raw_author.endswith(">"):
        name, email = raw_author.rsplit("<", 1)
        return name.strip(), email[:-1].strip() or None
    return raw_author.strip(), None


def _decode_display(value: bytes) -> str:
    # Repository metadata is untrusted bytes. Replacement keeps responses JSON-safe; lone
    # surrogates from surrogateescape would make the response serializer fail.
    return bytes(value).decode("utf-8", errors="replace")


def _decode_ascii_bytes(value: bytes) -> str:
    return value.decode("ascii")


def _first_line(text: str) -> str:
    return text.strip().split("\n", 1)[0].strip()


def _language_hint(path: str) -> str | None:
    guess, _ = mimetypes.guess_type(path)
    if guess is None:
        suffix = PurePosixPath(path).suffix.lstrip(".")
        return suffix or None
    return guess


def _language_name(path: str) -> str | None:
    language = detect_language(path)
    return language.name if language is not None else None


def _looks_binary(value: bytes) -> bool:
    return b"\x00" in value


def _parse_changed_files_from_diff(content: str) -> list[HgChangedFile]:
    changed_files: list[HgChangedFile] = []
    current: HgChangedFile | None = None
    saw_binary_marker = False

    for raw_line in content.splitlines():
        if raw_line.startswith("diff -r "):
            if current is not None:
                if saw_binary_marker:
                    current.insertions = None
                    current.deletions = None
                changed_files.append(current)
            current = HgChangedFile(
                path="unknown",
                status="modified",
                insertions=0,
                deletions=0,
                old_path=None,
            )
            saw_binary_marker = False
            continue

        if current is None:
            continue

        if raw_line.startswith("rename from "):
            current.old_path = raw_line.removeprefix("rename from ").strip()
            current.status = "renamed"
            continue

        if raw_line.startswith("rename to "):
            current.path = raw_line.removeprefix("rename to ").strip()
            current.status = "renamed"
            continue

        if raw_line.startswith("copy from "):
            current.old_path = raw_line.removeprefix("copy from ").strip()
            current.status = "copied"
            continue

        if raw_line.startswith("copy to "):
            current.path = raw_line.removeprefix("copy to ").strip()
            current.status = "copied"
            continue

        if raw_line.startswith("--- ") or raw_line.startswith("+++ "):
            if raw_line.endswith("/dev/null"):
                if raw_line.startswith("--- "):
                    current.status = "added"
                else:
                    current.status = "deleted"
                continue
            next_path = raw_line.replace("+++ b/", "").replace("--- a/", "").strip()
            if next_path and next_path != raw_line:
                current.path = next_path
            continue

        if raw_line.startswith("Binary file ") or raw_line.startswith("GIT binary patch"):
            saw_binary_marker = True
            continue

        if raw_line.startswith("+") and not raw_line.startswith("+++"):
            if current.insertions is not None:
                current.insertions += 1
            continue

        if raw_line.startswith("-") and not raw_line.startswith("---"):
            if current.deletions is not None:
                current.deletions += 1

    if current is not None:
        if saw_binary_marker:
            current.insertions = None
            current.deletions = None
        changed_files.append(current)

    return [file for file in changed_files if file.path != "unknown"]


@dataclass(slots=True)
class _HgDiffStat:
    files_changed: int | None
    insertions: int | None
    deletions: int | None


def _parse_diffstat_output(content: str) -> _HgDiffStat:
    files_changed: int | None = None
    insertions: int | None = None
    deletions: int | None = None

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = DIFFSTAT_SUMMARY_RE.match(line)
        if not match:
            continue
        files_changed = int(match.group("files"))
        insertions = int(match.group("insertions") or 0)
        deletions = int(match.group("deletions") or 0)

    return _HgDiffStat(
        files_changed=files_changed,
        insertions=insertions,
        deletions=deletions,
    )
