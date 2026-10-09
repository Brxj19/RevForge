from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from .diff_model import DiffFile

ContentKind = Literal["text", "binary", "image", "font", "symlink"]


@dataclass(slots=True)
class HgChangedFile:
    path: str
    status: str
    insertions: int | None
    deletions: int | None
    old_path: str | None = None
    binary: bool = False
    old_mode: str | None = None
    new_mode: str | None = None


@dataclass(slots=True)
class HgChangesetStats:
    files_changed: int | None
    insertions: int | None
    deletions: int | None
    changed_files: list[HgChangedFile]


@dataclass(slots=True)
class HgChangeset:
    node: str
    short_node: str
    parents: list[str]
    author_name: str
    author_email_when_available: str | None
    timestamp: datetime
    message: str
    branch: str
    tags: list[str]
    bookmarks: list[str]
    files_changed: list[str]
    revision_number: int
    stats: HgChangesetStats | None = None
    is_branch_head: bool = False
    is_merge: bool = False
    has_binary: bool = False
    stats_too_large: bool = False


@dataclass(slots=True)
class HgChangesetPage:
    changesets: list[HgChangeset]
    next_cursor: str | None
    scan_truncated: bool = False


@dataclass(slots=True)
class HgDiff:
    content: str
    is_truncated: bool
    truncation_reason: str | None
    files: list[DiffFile] = field(default_factory=list)
    files_truncated: bool = False


@dataclass(slots=True, frozen=True)
class HgChangesetRef:
    """Compact changeset summary attached to tree entries."""

    node: str
    short_node: str
    summary: str
    author_name: str
    date: datetime


@dataclass(slots=True)
class HgTreeEntry:
    name: str
    path: str
    kind: str
    size: int | None = None
    last_changeset: HgChangesetRef | None = None


@dataclass(slots=True)
class HgDirectoryBrowse:
    revision: str
    path: str
    entries: list[HgTreeEntry]


@dataclass(slots=True)
class HgFileBrowse:
    revision: str
    path: str
    content: str | None
    language_hint: str | None
    is_binary: bool
    is_too_large: bool
    size_when_known: int | None
    content_kind: ContentKind = "text"
    language: str | None = None


@dataclass(slots=True)
class HgBlameLine:
    line_number: int
    revision: str
    short_revision: str
    author_name: str
    author_email_when_available: str | None
    path: str
    content: str
    origin_line: int | None = None
    date: datetime | None = None
    summary: str = ""


@dataclass(slots=True)
class HgBlame:
    revision: str
    path: str
    lines: list[HgBlameLine]
    is_binary: bool = False
    is_too_large: bool = False


@dataclass(slots=True)
class HgRawFile:
    revision: str
    path: str
    data: bytes


@dataclass(slots=True, frozen=True)
class HgLanguageShare:
    name: str
    percent: float
    color: str


@dataclass(slots=True, frozen=True)
class HgRepositoryStats:
    revision: str
    languages: tuple[HgLanguageShare, ...]
    contributors: int
    contributors_truncated: bool
    size_bytes: int


@dataclass(slots=True)
class HgCodeSearchMatch:
    path: str
    line: int
    text: str
    ranges: list[tuple[int, int]] = field(default_factory=list)


@dataclass(slots=True)
class HgCodeSearchResult:
    revision: str
    items: list[HgCodeSearchMatch]
    truncated: bool


@dataclass(slots=True)
class HgFileSearchMatch:
    path: str
    language_hint: str | None


@dataclass(slots=True)
class HgReference:
    name: str
    node: str
    short_node: str
    updated_at: datetime | None = None
    summary: str | None = None
    state: Literal["open", "closed", "merged"] | None = None


@dataclass(slots=True)
class HgReferences:
    branches: list[HgReference]
    tags: list[HgReference]
    bookmarks: list[HgReference]


def mercurial_timestamp(raw_value: list[int] | list[float] | tuple[float, int]) -> datetime:
    seconds, _offset_seconds = raw_value
    return datetime.fromtimestamp(seconds, tz=UTC)
