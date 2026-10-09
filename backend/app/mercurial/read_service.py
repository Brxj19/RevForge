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
from typing import Any, Literal

from mercurial import (
    encoding,
    hg,
    initialization,
    patch,
    revset,
    revsetlang,
    scmutil,
    smartset,
    util,
)
from mercurial import error as hgerror
from mercurial import ui as uimod
from mercurial.node import hex as hg_hex
from mercurial.node import nullid, nullrev, wdirid

from app.core.config import Settings

from . import diff_model
from .command_runner import HgCommandRunner
from .diff_model import DiffCaps, DiffResult, build_file_diffs
from .errors import (
    ContentTooLargeError,
    HgCommandFailedError,
    HgCommandOutputLimitError,
    InvalidCursorError,
    InvalidHistoryFilterError,
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
HEX_QUERY_RE = re.compile(r"^[0-9a-fA-F]{6,40}$")
# hg file-pattern kinds; a history path filter that starts with one is rejected (never a
# pattern, even though it is passed as `path:` anyway).
_PATTERN_PREFIX_RE = re.compile(
    r"^(?:re|glob|relglob|path|filepath|relpath|rootfilesin|rootglob|relre|set|listfile0?"
    r"|include|subinclude|kind):"
)

# History scan windows and per-row diffstat bounds (Phase 2).
_HISTORY_WINDOW = 256
_STATS_MAX_FILES = 300
_STATS_ROW_INPUT_BYTES = 2 * 1024 * 1024
_STATS_PAGE_INPUT_BYTES = 10 * 1024 * 1024
# Above this many branches the "merged" state is not computed (reported as "open").
_REFS_MERGED_BRANCH_CAP = 500
# changed_files[].status keeps its pre-Phase-2 vocabulary for the frozen React app.
_LEGACY_STATUS = {
    "added": "added",
    "modified": "modified",
    "removed": "deleted",
    "renamed": "renamed",
    "copied": "copied",
}

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
_ROW_STATS_CACHE: _LRUCache[tuple[str, str], tuple[int, int, int, bool]] = _LRUCache(4096)

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
    _ROW_STATS_CACHE.clear()
    with _limiter_lock:
        _work_limiter = None


@dataclass(slots=True, frozen=True)
class HistoryFilters:
    """Validated, literal history filters (see ``validate_history_filters``)."""

    branch: str | None = None
    author: str | None = None
    path: str | None = None
    q: str | None = None

    @property
    def active(self) -> bool:
        return any(value is not None for value in (self.branch, self.author, self.path, self.q))

    @property
    def scans_content(self) -> bool:
        """Filters that inspect every scanned changeset (separate rate-limit bucket)."""
        return any(value is not None for value in (self.author, self.path, self.q))

    @property
    def hex_query(self) -> bytes | None:
        if self.q is not None and HEX_QUERY_RE.fullmatch(self.q):
            return self.q.lower().encode("ascii")
        return None


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
            work = asyncio.ensure_future(asyncio.to_thread(fn, *args, **kwargs))
            try:
                return await asyncio.shield(work)
            except asyncio.CancelledError:
                # A thread can't be cancelled: keep the slot until it really finishes,
                # or a disconnecting client could run unbounded concurrent hg work.
                while not work.done():
                    try:
                        await asyncio.wait({work})
                    except asyncio.CancelledError:
                        continue
                if not work.cancelled():
                    work.exception()  # retrieved: the caller is gone
                raise

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
        self,
        repository_path: Path,
        *,
        cursor: str | None,
        limit: int | None = None,
        filters: HistoryFilters | None = None,
    ) -> HgChangesetPage:
        """One page of served history, newest first, with optional literal filters.

        Everything (filters, per-row refs and diffstats) is evaluated in-process on the
        served view under one work slot; no revset built from input ever reaches the CLI,
        which would evaluate it on the visible view and could match secret changesets.
        """
        page_size = limit if limit is not None else self._settings.max_history_page_size
        cursor_node = validate_history_cursor(cursor)
        return await self._in_thread(
            repository_path,
            self._sync_list_changesets,
            repository_path,
            cursor_node,
            page_size,
            filters or HistoryFilters(),
        )

    def _sync_list_changesets(
        self,
        repository_path: Path,
        cursor_node: bytes | None,
        page_size: int,
        filters: HistoryFilters,
    ) -> HgChangesetPage:
        repo = self._open_repository(repository_path)
        changelog = repo.changelog
        tiprev = changelog.tiprev()
        empty = HgChangesetPage(changesets=[], next_cursor=None, scan_truncated=False)
        if tiprev < 0:
            if cursor_node is not None:
                raise RevisionNotFoundError()
            return empty
        start_revision = tiprev
        if cursor_node is not None:
            start_revision = int(self._context_for_node(repo, cursor_node).rev()) - 1
        if start_revision < 0:
            return empty
        if filters.branch is not None and not repo.branchmap().hasbranch(
            filters.branch.encode("utf-8")
        ):
            # `branch(literal:x)` raises for unknown names; an unknown branch is an empty page.
            return empty

        matcher = _history_matcher(filters)
        hex_query = filters.hex_query
        lowered_query = encoding.lower(filters.q.encode("utf-8")) if filters.q else b""
        budget = self._settings.history_scan_max_revisions
        deadline = time.monotonic() + self._settings.history_scan_timeout_seconds

        # Scan newest -> oldest in windows. The budget counts served revisions only, so a
        # run of hidden revisions can neither end the page early nor leak as a cursor; a
        # cursor is always the lowest *served* revision actually scanned.
        matches: list[int] = []
        lowest_scanned: int | None = None
        truncated = False
        high = start_revision
        while high >= 0:
            if budget <= 0 or (lowest_scanned is not None and time.monotonic() > deadline):
                truncated = True
                break
            low = max(0, high - _HISTORY_WINDOW + 1, high - budget + 1)
            subset = smartset.spanset(repo, low, high + 1)
            subset.reverse()
            served_in_window = len(subset)
            window_low = subset.min() if served_in_window else None
            revisions = matcher(repo, subset) if matcher is not None else subset
            for revision in revisions:
                if hex_query is not None:
                    candidate = repo[revision]
                    if not (
                        candidate.hex().startswith(hex_query)
                        or lowered_query in encoding.lower(candidate.description())
                    ):
                        continue
                matches.append(int(revision))
                if len(matches) > page_size:
                    break
            if len(matches) > page_size:
                break
            budget -= served_in_window
            if window_low is not None:
                lowest_scanned = int(window_low)
            high = low - 1

        next_cursor: str | None = None
        if len(matches) > page_size:
            matches = matches[:page_size]
            next_cursor = _decode_ascii_bytes(hg_hex(changelog.node(matches[-1])))
            truncated = False
        elif truncated and lowest_scanned is not None:
            next_cursor = _decode_ascii_bytes(hg_hex(changelog.node(lowest_scanned)))
        else:
            truncated = False

        branchmap = repo.branchmap()
        branch_heads = {
            bytes(head) for name in branchmap for head in branchmap.branchheads(name, closed=True)
        }
        page_input_budget = [_STATS_PAGE_INPUT_BYTES]
        changesets: list[HgChangeset] = []
        for revision in matches:
            ctx = repo[revision]
            changeset = self._parse_changeset_context(ctx, include_files=True)
            changeset.is_branch_head = bytes(ctx.node()) in branch_heads
            changeset.is_merge = len([p for p in ctx.parents() if p.rev() >= 0]) > 1
            self._attach_row_stats(repository_path, repo, ctx, changeset, page_input_budget)
            changesets.append(changeset)
        return HgChangesetPage(
            changesets=changesets, next_cursor=next_cursor, scan_truncated=truncated
        )

    def _attach_row_stats(
        self,
        repository_path: Path,
        repo: Any,
        ctx: Any,
        changeset: HgChangeset,
        page_input_budget: list[int],
    ) -> None:
        """Diffstat against p1, in-process, after bounding the input from stored sizes."""
        cache_key = (str(repository_path), changeset.node)
        cached = _ROW_STATS_CACHE.get(cache_key)
        if cached is None:
            files_changed, insertions, deletions, has_binary = _compute_row_stats(
                repo, ctx, page_input_budget
            )
            if insertions is not None and deletions is not None:
                # Only exact results are cached; over-budget depends on the page budget.
                _ROW_STATS_CACHE.put(cache_key, (files_changed, insertions, deletions, has_binary))
        else:
            files_changed, insertions, deletions, has_binary = cached
        changeset.stats = HgChangesetStats(
            files_changed=files_changed,
            insertions=insertions,
            deletions=deletions,
            changed_files=[],
        )
        changeset.has_binary = has_binary
        changeset.stats_too_large = insertions is None

    async def get_changeset(self, repository_path: Path, revision: str) -> HgChangeset:
        return await self._in_thread(
            repository_path, self._sync_get_changeset, repository_path, revision
        )

    def _sync_get_changeset(self, repository_path: Path, revision: str) -> HgChangeset:
        repo = self._open_repository(repository_path)
        ctx = self._resolve_context(repo, revision)
        changeset = self._parse_changeset_context(ctx, include_files=True)
        changeset.is_merge = len([p for p in ctx.parents() if p.rev() >= 0]) > 1
        result = build_file_diffs(repo, ctx.p1(), ctx, self._diff_caps(include_lines=False))
        changed_files = [
            HgChangedFile(
                path=item.path,
                status=_LEGACY_STATUS[item.status],
                insertions=None if item.too_large or item.truncated else item.insertions,
                deletions=None if item.too_large or item.truncated else item.deletions,
                old_path=item.old_path,
                binary=item.binary,
                old_mode=item.old_mode,
                new_mode=item.new_mode,
            )
            for item in result.files
        ]
        changeset.has_binary = any(item.binary for item in result.files)
        complete = result.complete
        changeset.stats = HgChangesetStats(
            files_changed=len(changed_files) if not result.files_truncated else None,
            insertions=sum(item.insertions for item in result.files) if complete else None,
            deletions=sum(item.deletions for item in result.files) if complete else None,
            changed_files=changed_files,
        )
        changeset.stats_too_large = not complete
        return changeset

    async def get_diff(self, repository_path: Path, revision: str) -> HgDiff:
        return await self._in_thread(
            repository_path, self._sync_get_diff, repository_path, revision
        )

    def _sync_get_diff(self, repository_path: Path, revision: str) -> HgDiff:
        repo = self._open_repository(repository_path)
        ctx = self._resolve_context(repo, revision)
        result = build_file_diffs(
            repo, ctx.p1(), ctx, self._diff_caps(include_lines=True, include_content=True)
        )
        return HgDiff(
            content=result.content,
            is_truncated=result.content_truncated,
            truncation_reason="diff_too_large" if result.content_truncated else None,
            files=result.files,
            files_truncated=result.files_truncated,
        )

    async def diff_against_merge_base(
        self, repository_path: Path, *, base: str, head: str
    ) -> tuple[str, str, DiffResult]:
        """Diff ``ancestor(base, head)`` -> ``head`` (served view). Returns resolved nodes."""
        return await self._in_thread(
            repository_path, self._sync_diff_against_merge_base, repository_path, base, head
        )

    def _sync_diff_against_merge_base(
        self, repository_path: Path, base: str, head: str
    ) -> tuple[str, str, DiffResult]:
        repo = self._open_repository(repository_path)
        base_ctx = self._resolve_context(repo, base)
        head_ctx = self._resolve_context(repo, head)
        ancestor = repo.revs(b"ancestor(%n, %n)", base_ctx.node(), head_ctx.node()).first()
        # Unrelated histories have no common ancestor: diff from the empty revision.
        ancestor_ctx = repo[ancestor] if ancestor is not None else repo[nullrev]
        result = build_file_diffs(
            repo, ancestor_ctx, head_ctx, self._diff_caps(include_lines=False)
        )
        return _decode_ascii_bytes(base_ctx.hex()), _decode_ascii_bytes(head_ctx.hex()), result

    async def is_ancestor(self, repository_path: Path, *, ancestor: str, descendant: str) -> bool:
        """True when the served full node ``ancestor`` is in ``descendant``'s history."""
        return await self._in_thread(
            repository_path, self._sync_is_ancestor, repository_path, ancestor, descendant
        )

    def _sync_is_ancestor(self, repository_path: Path, ancestor: str, descendant: str) -> bool:
        repo = self._open_repository(repository_path)
        first = self._resolve_context(repo, ancestor)
        second = self._resolve_context(repo, descendant)
        return bool(repo.changelog.isancestorrev(first.rev(), second.rev()))

    def _diff_caps(self, *, include_lines: bool, include_content: bool = False) -> DiffCaps:
        return DiffCaps(
            max_files=diff_model.DEFAULT_MAX_FILES,
            max_lines_per_file=diff_model.DEFAULT_MAX_LINES_PER_FILE,
            max_total_lines=diff_model.DEFAULT_MAX_TOTAL_LINES,
            max_line_chars=diff_model.DEFAULT_MAX_LINE_CHARS,
            max_bytes=self._settings.max_diff_bytes,
            max_file_input_bytes=self._settings.diff_max_file_input_bytes,
            max_total_input_bytes=self._settings.diff_max_total_input_bytes,
            timeout_seconds=self._settings.diff_timeout_seconds,
            include_lines=include_lines,
            include_content=include_content,
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
        size = _bounded_size(
            fctx, max(self._settings.max_file_content_bytes, self._settings.max_raw_bytes)
        )
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
            link_target=bytes(fctx.data()) if is_link and size <= _MAX_LINK_TARGET_BYTES else None,
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
                size = _stored_size(ctx.filectx(file_path, fileid=manifest[file_path]))
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
        max_bytes = self._settings.max_file_content_bytes
        if _bounded_size(fctx, max_bytes) > max_bytes:
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
            size = _bounded_size(fctx, self._settings.code_search_max_file_bytes)
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

    async def list_refs(
        self, repository_path: Path, *, include_closed: bool = False
    ) -> HgReferences:
        return await self._in_thread(
            repository_path, self._sync_list_refs, repository_path, include_closed
        )

    def _sync_list_refs(self, repository_path: Path, include_closed: bool = False) -> HgReferences:
        """Branches, tags and bookmarks from the served view (secret changesets hidden)."""
        repo = self._open_repository(repository_path)
        changelog = repo.changelog

        def served_rev(node: bytes) -> int | None:
            try:
                return int(changelog.rev(node))
            except (hgerror.LookupError, hgerror.RepoLookupError, IndexError):
                return None

        def reference(name: bytes, node: bytes, rev: int) -> HgReference:
            hex_node = _decode_ascii_bytes(hg_hex(node))
            target = repo[rev]
            return HgReference(
                name=_decode_display(name),
                node=hex_node,
                short_node=hex_node[:12],
                updated_at=mercurial_timestamp(list(target.date())),
                summary=_first_line(_decode_display(target.description())),
            )

        branchmap = repo.branchmap()
        branch_infos = list(branchmap.branches_info(repo))
        default_tip = (
            served_rev(branchmap.branchtip(b"default")) if branchmap.hasbranch(b"default") else None
        )
        compute_merged = len(branch_infos) <= _REFS_MERGED_BRANCH_CAP
        branches: list[tuple[int, HgReference]] = []
        for name, _tiprev, _active, is_open in branch_infos:
            if not is_open and not include_closed:
                continue  # closed branches are hidden by default, as in `hg branches`
            tip = branchmap.branchtip(name)
            rev = served_rev(tip)
            if rev is None:
                continue
            ref = reference(name, tip, rev)
            state: Literal["open", "closed", "merged"] = "open" if is_open else "closed"
            if is_open and compute_merged and name != b"default" and default_tip is not None:
                open_heads = [
                    served_rev(head) for head in branchmap.branchheads(name, closed=False)
                ]
                if open_heads and all(
                    head_rev is not None and changelog.isancestorrev(head_rev, default_tip)
                    for head_rev in open_heads
                ):
                    state = "merged"
            ref.state = state
            branches.append((rev, ref))

        tags: list[tuple[int, HgReference]] = []
        for name, tag_node in repo.tagslist():
            if name == b"tip":
                continue
            rev = served_rev(tag_node)
            if rev is not None:
                tags.append((rev, reference(name, tag_node, rev)))

        bookmarks: list[HgReference] = []
        for name, bookmark_node in sorted(repo._bookmarks.items()):
            rev = served_rev(bookmark_node)
            if rev is not None:
                bookmarks.append(reference(name, bookmark_node, rev))

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
        size = _stored_size(ctx.filectx(path_bytes, fileid=manifest[path_bytes]))
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


def _has_control_characters(value: str) -> bool:
    return any(ord(character) < 32 or ord(character) == 127 for character in value)


def validate_history_filters(
    *,
    branch: str | None = None,
    author: str | None = None,
    path: str | None = None,
    q: str | None = None,
) -> HistoryFilters:
    """Validate history filters. Values are only ever used as literals (never patterns)."""
    branch = branch if branch not in (None, "") else None
    author = author if author not in (None, "") else None
    q = q if q not in (None, "") else None
    if branch is not None and (
        not 1 <= len(branch.encode("utf-8", errors="surrogatepass")) <= 255
        or _has_control_characters(branch)
    ):
        raise InvalidHistoryFilterError("branch")
    if author is not None and (not 1 <= len(author) <= 100 or _has_control_characters(author)):
        raise InvalidHistoryFilterError("author")
    if q is not None and (
        not 2 <= len(q) <= 200 or any(character in q for character in ("\x00", "\r", "\n"))
    ):
        raise InvalidHistoryFilterError("q")
    normalized_path: str | None = None
    if path not in (None, ""):
        assert path is not None
        if path.startswith("/") or _PATTERN_PREFIX_RE.match(path):
            raise InvalidRepositoryPathError()
        normalized_path = validate_repository_relative_path(path) or None
        if normalized_path is not None and len(normalized_path.encode("utf-8")) > 1024:
            raise InvalidRepositoryPathError()
    for value in (branch, author, q):
        if value is not None:
            try:
                value.encode("utf-8")
            except UnicodeEncodeError as exc:
                raise InvalidHistoryFilterError("encoding") from exc
    return HistoryFilters(branch=branch, author=author, path=normalized_path, q=q)


def validate_history_cursor(cursor: str | None) -> bytes | None:
    """History cursors are full 40-hex nodes only (never refs, prefixes or revsets)."""
    if cursor is None or cursor == "":
        return None
    if not FULL_NODE_RE.fullmatch(cursor):
        raise InvalidCursorError()
    return bytes.fromhex(cursor)


def _history_matcher(filters: HistoryFilters) -> Callable[..., Any] | None:
    """A revset matcher built only with formatspec and literal:/path: prefixes."""
    parts: list[bytes] = []
    args: list[bytes] = []
    if filters.branch is not None:
        parts.append(b"branch(%s)")
        args.append(b"literal:" + filters.branch.encode("utf-8"))
    if filters.author is not None:
        parts.append(b"user(%s)")
        args.append(b"literal:" + filters.author.encode("utf-8"))
    if filters.q is not None and filters.hex_query is None:
        parts.append(b"desc(%s)")
        args.append(b"literal:" + filters.q.encode("utf-8"))
    if filters.path is not None:
        parts.append(b"file(%s)")
        args.append(b"path:" + filters.path.encode("utf-8"))
    if not parts:
        return None
    spec = revsetlang.formatspec(b" and ".join(parts), *args)
    # ui=None: no [revsetalias] from any hgrc can rewrite the expression.
    return revset.match(None, spec)  # type: ignore[no-any-return]


def _compute_row_stats(
    repo: Any, ctx: Any, page_input_budget: list[int]
) -> tuple[int, int | None, int | None, bool]:
    """(files, insertions, deletions, has_binary) vs p1; line counts None when over budget.

    The file list and stored sizes are checked before any file content is read, so a
    huge changeset never gets decompressed for a history row. The file count comes from
    the manifest status and is always known.
    """
    parent = ctx.p1()
    status = parent.status(ctx)
    modified = list(status.modified)
    added = list(status.added)
    removed = list(status.removed)
    file_count = len(modified) + len(added) + len(removed)
    if file_count > _STATS_MAX_FILES:
        return file_count, None, None, False
    limit = min(_STATS_ROW_INPUT_BYTES, page_input_budget[0])
    total = 0
    for side, paths in ((parent, modified), (ctx, modified), (ctx, added), (parent, removed)):
        for path in paths:
            total += _stored_size(side[path])
            if total > limit:
                return file_count, None, None, False
    page_input_budget[0] -= total
    opts = patch.diffallopts(repo.ui, {b"git": True, b"nobinary": True})
    data = patch.diffstatdata(util.iterlines(ctx.diff(opts=opts)))
    return (
        len(data),
        sum(int(entry[1]) for entry in data),
        sum(int(entry[2]) for entry in data),
        any(bool(entry[3]) for entry in data),
    )


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


# A symlink target is a short path; anything bigger is not read for display.
_MAX_LINK_TARGET_BYTES = 4096


def _stored_size(fctx: Any) -> int:
    """Upper bound on a file revision's size, read from the revlog index without decompressing.

    ``filectx.size()`` decompresses the whole revision when it carries copy/rename metadata,
    so a few KB pushed as copies of a huge compressible file would make every listing read
    gigabytes. The stored length includes that metadata header (tens of bytes), so it can
    overstate the size slightly; it never understates it.
    """
    return int(fctx.filelog()._revlog.rawsize(fctx.filerev()))


def _bounded_size(fctx: Any, cap: int) -> int:
    """The exact size when the stored length is within ``cap``, else the stored length."""
    stored = _stored_size(fctx)
    return stored if stored > cap else int(fctx.size())


def _looks_binary(value: bytes) -> bool:
    return b"\x00" in value
