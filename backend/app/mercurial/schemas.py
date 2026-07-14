from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(slots=True)
class HgChangedFile:
    path: str
    status: str
    insertions: int | None
    deletions: int | None
    old_path: str | None = None


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


@dataclass(slots=True)
class HgChangesetPage:
    changesets: list[HgChangeset]
    next_cursor: str | None


@dataclass(slots=True)
class HgDiff:
    content: str
    is_truncated: bool
    truncation_reason: str | None


@dataclass(slots=True)
class HgTreeEntry:
    name: str
    path: str
    kind: str


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


@dataclass(slots=True)
class HgBlameLine:
    line_number: int
    revision: str
    short_revision: str
    author_name: str
    author_email_when_available: str | None
    path: str
    content: str


@dataclass(slots=True)
class HgBlame:
    revision: str
    path: str
    lines: list[HgBlameLine]


@dataclass(slots=True)
class HgFileSearchMatch:
    path: str
    language_hint: str | None


@dataclass(slots=True)
class HgReference:
    name: str
    node: str
    short_node: str


@dataclass(slots=True)
class HgReferences:
    branches: list[HgReference]
    tags: list[HgReference]
    bookmarks: list[HgReference]


def mercurial_timestamp(raw_value: list[int]) -> datetime:
    seconds, _offset_seconds = raw_value
    return datetime.fromtimestamp(seconds, tz=UTC)
