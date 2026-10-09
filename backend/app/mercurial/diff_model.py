"""Shared, bounded, in-process diff model (changeset diff, changeset detail, PR diff).

Built on ``patch.diffhunks`` with git headers and ``nobinary`` so binary changes are reported
as a flag and never as base85 patches. Every input is bounded *before* Mercurial reads file
contents: the file list comes from ``ctx1.status(ctx2)`` (manifest comparison), oversized
files are found from stored revlog sizes, and only the files that fit are handed to
``diffhunks`` through an exact-file matcher. Output is bounded by file, line, byte and
line-length caps and a wall-clock deadline.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Literal

from mercurial import copies as copiesmod
from mercurial import patch, scmutil

DiffStatus = Literal["added", "modified", "removed", "renamed", "copied"]
DiffLineKind = Literal["context", "add", "del", "meta"]

DEFAULT_MAX_FILES = 300
DEFAULT_MAX_LINES_PER_FILE = 5_000
DEFAULT_MAX_TOTAL_LINES = 20_000
DEFAULT_MAX_LINE_CHARS = 2_000

_MODE_BY_FLAG = {b"": "100644", b"x": "100755", b"l": "120000"}


@dataclass(slots=True)
class DiffLine:
    kind: DiffLineKind
    old_line: int | None
    new_line: int | None
    text: str


@dataclass(slots=True)
class DiffHunk:
    header: str
    old_start: int
    old_lines: int
    new_start: int
    new_lines: int
    lines: list[DiffLine] = field(default_factory=list)


@dataclass(slots=True)
class DiffFile:
    path: str
    old_path: str | None
    status: DiffStatus
    binary: bool
    old_mode: str | None
    new_mode: str | None
    insertions: int
    deletions: int
    too_large: bool = False
    truncated: bool = False
    hunks: list[DiffHunk] = field(default_factory=list)


@dataclass(slots=True)
class DiffCaps:
    max_files: int = DEFAULT_MAX_FILES
    max_lines_per_file: int = DEFAULT_MAX_LINES_PER_FILE
    max_total_lines: int = DEFAULT_MAX_TOTAL_LINES
    max_line_chars: int = DEFAULT_MAX_LINE_CHARS
    # Emitted hunk text (files) and unified text (content) are each bounded by this.
    max_bytes: int = 262_144
    # Stored size (old + new) above which one file is reported too_large without diffing.
    max_file_input_bytes: int = 4 * 1024 * 1024
    # Total stored size handed to diffhunks; later files are reported too_large.
    max_total_input_bytes: int = 32 * 1024 * 1024
    timeout_seconds: float = 10.0
    include_lines: bool = True
    include_content: bool = False


@dataclass(slots=True)
class DiffResult:
    files: list[DiffFile]
    files_truncated: bool
    content: str = ""
    content_truncated: bool = False

    @property
    def complete(self) -> bool:
        """True when every changed file was diffed in full (totals are exact)."""
        return not self.files_truncated and not any(
            item.too_large or (item.truncated and not item.hunks) for item in self.files
        )


@dataclass(slots=True)
class _Entry:
    path: bytes
    old_path: bytes | None
    status: DiffStatus
    # Paths the matcher must include so diffhunks reports this entry (rename source too).
    match_paths: tuple[bytes, ...]
    input_size: int


def stored_size(fctx: Any) -> int:
    """Upper bound on a file revision's size from the revlog index (no decompression)."""
    return int(fctx.filelog()._revlog.rawsize(fctx.filerev()))


def _mode(ctx: Any, path: bytes) -> str | None:
    try:
        flags = ctx.flags(path)
    except Exception:
        return None
    return _MODE_BY_FLAG.get(bytes(flags), "100644")


def _decode(value: bytes) -> str:
    return bytes(value).decode("utf-8", errors="replace")


def _size_in(ctx: Any, path: bytes) -> int:
    try:
        return stored_size(ctx[path])
    except Exception:
        return 0


def _plan_entries(ctx1: Any, ctx2: Any) -> list[_Entry]:
    """One entry per reported file, from the manifest status plus copy tracing."""
    status = ctx1.status(ctx2)
    modified = list(status.modified)
    added = list(status.added)
    removed = set(status.removed)
    copy_map: dict[bytes, bytes] = {}
    if added:
        added_set = set(added)
        copy_map = {
            bytes(dst): bytes(src)
            for dst, src in copiesmod.pathcopies(ctx1, ctx2).items()
            if dst in added_set
        }
    consumed: set[bytes] = set()
    entries: list[_Entry] = []
    for path in modified:
        entries.append(
            _Entry(
                path=path,
                old_path=None,
                status="modified",
                match_paths=(path,),
                input_size=_size_in(ctx1, path) + _size_in(ctx2, path),
            )
        )
    for path in added:
        source = copy_map.get(path)
        if source is not None:
            renamed = source in removed and source not in consumed
            if renamed:
                consumed.add(source)
            entries.append(
                _Entry(
                    path=path,
                    old_path=source,
                    status="renamed" if renamed else "copied",
                    match_paths=(path, source) if renamed else (path,),
                    input_size=_size_in(ctx1, source) + _size_in(ctx2, path),
                )
            )
            continue
        entries.append(
            _Entry(
                path=path,
                old_path=None,
                status="added",
                match_paths=(path,),
                input_size=_size_in(ctx2, path),
            )
        )
    for path in sorted(removed - consumed):
        entries.append(
            _Entry(
                path=path,
                old_path=None,
                status="removed",
                match_paths=(path,),
                input_size=_size_in(ctx1, path),
            )
        )
    entries.sort(key=lambda entry: entry.path)
    return entries


def _placeholder(
    entry: _Entry, ctx1: Any, ctx2: Any, *, too_large: bool = False, truncated: bool = False
) -> DiffFile:
    old_side = entry.old_path or entry.path
    return DiffFile(
        path=_decode(entry.path),
        old_path=_decode(entry.old_path) if entry.old_path is not None else None,
        status=entry.status,
        binary=False,
        old_mode=None if entry.status == "added" else _mode(ctx1, old_side),
        new_mode=None if entry.status == "removed" else _mode(ctx2, entry.path),
        insertions=0,
        deletions=0,
        too_large=too_large,
        truncated=truncated,
    )


class _Budget:
    def __init__(self, caps: DiffCaps) -> None:
        self.caps = caps
        self.total_lines = 0
        self.total_bytes = 0
        self.content_parts: list[str] = []
        self.content_bytes = 0
        self.content_truncated = False

    def add_content(self, text: str) -> None:
        if not self.caps.include_content or self.content_truncated:
            return
        size = len(text.encode("utf-8"))
        if self.content_bytes + size > self.caps.max_bytes:
            self.content_truncated = True
            return
        self.content_parts.append(text)
        self.content_bytes += size


def _parse_hunk(
    hunk_range: tuple[int, int, int, int],
    hunk_lines: list[bytes],
    file_diff: DiffFile,
    budget: _Budget,
    file_lines: list[int],
) -> DiffHunk | None:
    caps = budget.caps
    old_start, old_count, new_start, new_count = hunk_range
    header = _decode(hunk_lines[0]).rstrip("\n") if hunk_lines else ""
    hunk = DiffHunk(
        header=header,
        old_start=int(old_start),
        old_lines=int(old_count),
        new_start=int(new_start),
        new_lines=int(new_count),
    )
    emit = caps.include_lines and not file_diff.truncated
    old_line = int(old_start)
    new_line = int(new_start)
    for raw in hunk_lines[1:]:
        marker = raw[:1]
        kind: DiffLineKind
        old_no: int | None = None
        new_no: int | None = None
        if marker == b"+":
            kind = "add"
            file_diff.insertions += 1
            new_no = new_line
            new_line += 1
        elif marker == b"-":
            kind = "del"
            file_diff.deletions += 1
            old_no = old_line
            old_line += 1
        elif marker == b"\\":
            kind = "meta"
        else:
            kind = "context"
            old_no = old_line
            new_no = new_line
            old_line += 1
            new_line += 1
        if not emit:
            continue
        if (
            file_lines[0] >= caps.max_lines_per_file
            or budget.total_lines >= caps.max_total_lines
            or budget.total_bytes >= caps.max_bytes
        ):
            file_diff.truncated = True
            emit = False
            continue
        body = raw[1:] if kind != "meta" else raw
        text = _decode(body).removesuffix("\n").removesuffix("\r")
        if len(text) > caps.max_line_chars:
            text = text[: caps.max_line_chars]
            file_diff.truncated = True
        hunk.lines.append(DiffLine(kind=kind, old_line=old_no, new_line=new_no, text=text))
        file_lines[0] += 1
        budget.total_lines += 1
        budget.total_bytes += len(text.encode("utf-8")) + 1
    return hunk if caps.include_lines else None


def build_file_diffs(repo: Any, ctx1: Any, ctx2: Any, caps: DiffCaps) -> DiffResult:
    """Diff ``ctx1`` -> ``ctx2`` within ``repo`` (a served view) under ``caps``."""
    deadline = time.monotonic() + caps.timeout_seconds
    entries = _plan_entries(ctx1, ctx2)
    files_truncated = len(entries) > caps.max_files
    entries = entries[: caps.max_files]

    budget = _Budget(caps)
    included: list[_Entry] = []
    placeholders: dict[bytes, DiffFile] = {}
    input_total = 0
    for entry in entries:
        if (
            entry.input_size > caps.max_file_input_bytes
            or input_total + entry.input_size > caps.max_total_input_bytes
        ):
            placeholders[entry.path] = _placeholder(entry, ctx1, ctx2, too_large=True)
            continue
        input_total += entry.input_size
        included.append(entry)

    results: dict[bytes, DiffFile] = dict(placeholders)
    if included:
        by_path = {entry.path: entry for entry in included}
        match_paths = sorted({path for entry in included for path in entry.match_paths})
        matcher = scmutil.matchfiles(repo, match_paths)
        copy = {
            entry.path: entry.old_path
            for entry in included
            if entry.old_path is not None and entry.status in {"renamed", "copied"}
        }
        opts = patch.diffallopts(repo.ui, {b"git": True, b"nobinary": True})
        generator = patch.diffhunks(repo, ctx1, ctx2, match=matcher, opts=opts, copy=copy)
        timed_out = False
        for fctx1, fctx2, header, hunks in generator:
            key = bytes(fctx2.path()) if fctx2 is not None else bytes(fctx1.path())
            planned = by_path.get(key)
            if planned is None:
                continue
            if time.monotonic() > deadline:
                timed_out = True
                break
            file_diff = _placeholder(planned, ctx1, ctx2)
            for line in header:
                budget.add_content(_decode(line).removesuffix("\n") + "\n")
            file_lines = [0]
            for hunk_range, hunk_lines in hunks:
                if hunk_range is None:
                    file_diff.binary = True
                    for line in hunk_lines:
                        budget.add_content(_decode(line))
                    continue
                for line in hunk_lines:
                    budget.add_content(_decode(line))
                parsed = _parse_hunk(hunk_range, hunk_lines, file_diff, budget, file_lines)
                if parsed is not None and (parsed.lines or not file_diff.truncated):
                    file_diff.hunks.append(parsed)
            results[key] = file_diff
        if timed_out:
            files_truncated = True
        for entry in included:
            if entry.path not in results:
                # Not reached before the deadline (or not reported): listed, not diffed.
                results[entry.path] = _placeholder(entry, ctx1, ctx2, truncated=timed_out)

    ordered = [results[entry.path] for entry in entries if entry.path in results]
    if any(item.too_large for item in ordered):
        budget.content_truncated = budget.content_truncated or caps.include_content
    return DiffResult(
        files=ordered,
        files_truncated=files_truncated,
        content="".join(budget.content_parts),
        content_truncated=budget.content_truncated or files_truncated,
    )
