from __future__ import annotations

import mimetypes
import re
from pathlib import PurePosixPath

from app.core.config import Settings

from .command_runner import HgCommandRunner
from .errors import (
    HgCommandFailedError,
    HgCommandOutputLimitError,
    InvalidRepositoryPathError,
    InvalidRevisionError,
    MercurialNotFoundError,
)
from .schemas import (
    HgChangeset,
    HgChangesetPage,
    HgDiff,
    HgDirectoryBrowse,
    HgFileBrowse,
    HgReference,
    HgReferences,
    HgTreeEntry,
    mercurial_timestamp,
)

FULL_NODE_RE = re.compile(r"^[0-9a-f]{40}$")
SAFE_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$")


class MercurialReadService:
    def __init__(self, *, settings: Settings, command_runner: HgCommandRunner) -> None:
        self._settings = settings
        self._command_runner = command_runner

    async def list_changesets(self, repository_path, *, cursor: str | None) -> HgChangesetPage:
        page_size = self._settings.max_history_page_size
        if cursor is None:
            payload = await self._command_runner.run_json(
                ["log", "-Tjson", "-v", "-l", str(page_size + 1)],
                repository_path=repository_path,
            )
        else:
            cursor_changeset = await self.get_changeset(repository_path, cursor)
            if cursor_changeset.revision_number <= 0:
                return HgChangesetPage(changesets=[], next_cursor=None)
            payload = await self._command_runner.run_json(
                [
                    "log",
                    "-Tjson",
                    "-v",
                    "-r",
                    f"{cursor_changeset.revision_number - 1}:0",
                    "-l",
                    str(page_size + 1),
                ],
                repository_path=repository_path,
            )
        changesets = [self._parse_changeset(entry) for entry in payload]
        next_cursor = changesets[page_size - 1].node if len(changesets) > page_size else None
        return HgChangesetPage(changesets=changesets[:page_size], next_cursor=next_cursor)

    async def get_changeset(self, repository_path, revision: str) -> HgChangeset:
        node = await self.resolve_revision(repository_path, revision)
        payload = await self._command_runner.run_json(
            ["log", "-Tjson", "-v", "-r", node],
            repository_path=repository_path,
        )
        if not payload:
            raise MercurialNotFoundError()
        return self._parse_changeset(payload[0])

    async def get_diff(self, repository_path, revision: str) -> HgDiff:
        node = await self.resolve_revision(repository_path, revision)
        try:
            result = await self._command_runner.run(
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

    async def browse(self, repository_path, *, revision: str | None, path: str | None):
        normalized_path = validate_repository_relative_path(path)
        node = await self._default_or_requested_revision(repository_path, revision)
        manifest_args = ["manifest", "-Tjson"]
        if node is not None:
            manifest_args.extend(["-r", node])
        manifest = await self._command_runner.run_json(
            manifest_args, repository_path=repository_path
        )
        files = [entry["path"] for entry in manifest]
        if node is None:
            if normalized_path != "":
                raise MercurialNotFoundError()
            return HgDirectoryBrowse(revision="", path="", entries=[])
        if normalized_path == "":
            return HgDirectoryBrowse(
                revision=node,
                path="",
                entries=self._build_directory_entries(files, ""),
            )
        if normalized_path in files:
            return await self._read_file(repository_path, node=node, path=normalized_path)
        directory_prefix = f"{normalized_path}/"
        if any(file_path.startswith(directory_prefix) for file_path in files):
            return HgDirectoryBrowse(
                revision=node,
                path=normalized_path,
                entries=self._build_directory_entries(files, normalized_path),
            )
        raise MercurialNotFoundError()

    async def list_refs(self, repository_path) -> HgReferences:
        branches_payload = await self._command_runner.run_json(
            ["branches", "-Tjson"],
            repository_path=repository_path,
        )
        tags_payload = await self._command_runner.run_json(
            ["tags", "-Tjson"], repository_path=repository_path
        )
        bookmarks_payload = await self._command_runner.run_json(
            ["bookmarks", "-Tjson"],
            repository_path=repository_path,
        )
        branches = [
            HgReference(
                name=entry["branch"],
                node=entry["node"],
                short_node=entry["node"][:12],
            )
            for entry in branches_payload
        ]
        tags = [
            HgReference(
                name=entry["tag"],
                node=entry["node"],
                short_node=entry["node"][:12],
            )
            for entry in tags_payload
            if entry["tag"] != "tip"
        ]
        bookmarks = [
            HgReference(
                name=entry["bookmark"],
                node=entry["node"],
                short_node=entry["node"][:12],
            )
            for entry in bookmarks_payload
        ]
        return HgReferences(branches=branches, tags=tags, bookmarks=bookmarks)

    async def resolve_revision(self, repository_path, revision: str | None) -> str:
        if revision is None or revision == "":
            payload = await self._command_runner.run_json(
                ["log", "-Tjson", "-l", "1"],
                repository_path=repository_path,
            )
            if not payload:
                raise MercurialNotFoundError()
            return str(payload[0]["node"])
        normalized_revision = revision.strip()
        if FULL_NODE_RE.fullmatch(normalized_revision):
            payload = await self._command_runner.run_json(
                ["log", "-Tjson", "-r", normalized_revision],
                repository_path=repository_path,
            )
            if not payload:
                raise MercurialNotFoundError()
            return normalized_revision
        if not SAFE_REF_RE.fullmatch(normalized_revision):
            raise InvalidRevisionError()

        refs = await self.list_refs(repository_path)
        for ref in refs.branches + refs.tags + refs.bookmarks:
            if ref.name == normalized_revision:
                return ref.node
        raise MercurialNotFoundError()

    async def _default_or_requested_revision(
        self,
        repository_path,
        revision: str | None,
    ) -> str | None:
        if revision is not None and revision != "":
            return await self.resolve_revision(repository_path, revision)
        payload = await self._command_runner.run_json(
            ["log", "-Tjson", "-l", "1"],
            repository_path=repository_path,
        )
        if not payload:
            return None
        return str(payload[0]["node"])

    async def _read_file(self, repository_path, *, node: str, path: str) -> HgFileBrowse:
        try:
            result = await self._command_runner.run(
                ["cat", "-r", node, "--", path],
                repository_path=repository_path,
                stdout_limit=self._settings.max_file_content_bytes,
            )
        except HgCommandOutputLimitError:
            return HgFileBrowse(
                revision=node,
                path=path,
                content=None,
                language_hint=_language_hint(path),
                is_binary=False,
                is_too_large=True,
                size_when_known=None,
            )
        except HgCommandFailedError as exc:
            if exc.code == "hg_missing_path":
                raise MercurialNotFoundError() from exc
            raise

        if _looks_binary(result.stdout):
            return HgFileBrowse(
                revision=node,
                path=path,
                content=None,
                language_hint=_language_hint(path),
                is_binary=True,
                is_too_large=False,
                size_when_known=len(result.stdout),
            )

        try:
            content = result.stdout.decode("utf-8")
        except UnicodeDecodeError:
            return HgFileBrowse(
                revision=node,
                path=path,
                content=None,
                language_hint=_language_hint(path),
                is_binary=True,
                is_too_large=False,
                size_when_known=len(result.stdout),
            )
        return HgFileBrowse(
            revision=node,
            path=path,
            content=content,
            language_hint=_language_hint(path),
            is_binary=False,
            is_too_large=False,
            size_when_known=len(result.stdout),
        )

    def _build_directory_entries(
        self, manifest_paths: list[str], directory_path: str
    ) -> list[HgTreeEntry]:
        prefix = f"{directory_path}/" if directory_path else ""
        seen: dict[str, HgTreeEntry] = {}
        for manifest_path in manifest_paths:
            if prefix and not manifest_path.startswith(prefix):
                continue
            remainder = manifest_path[len(prefix) :] if prefix else manifest_path
            if not remainder:
                continue
            head, _, tail = remainder.partition("/")
            child_path = f"{prefix}{head}" if prefix else head
            if tail:
                seen.setdefault(
                    head,
                    HgTreeEntry(name=head, path=child_path, kind="directory"),
                )
            else:
                seen.setdefault(head, HgTreeEntry(name=head, path=child_path, kind="file"))
        return sorted(seen.values(), key=lambda entry: (entry.kind != "directory", entry.name))

    def _parse_changeset(self, entry: dict) -> HgChangeset:
        author_name, author_email = _parse_author(str(entry["user"]))
        return HgChangeset(
            node=str(entry["node"]),
            short_node=str(entry["node"])[:12],
            parents=[
                parent for parent in entry.get("parents", []) if not parent.startswith("0000")
            ],
            author_name=author_name,
            author_email_when_available=author_email,
            timestamp=mercurial_timestamp(entry["date"]),
            message=str(entry["desc"]),
            branch=str(entry["branch"]),
            tags=[tag for tag in entry.get("tags", []) if tag != "tip"],
            bookmarks=list(entry.get("bookmarks", [])),
            files_changed=list(entry.get("files", [])),
            revision_number=int(entry["rev"]),
        )


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
    segments = path.parts
    if any(segment in {"", ".", ".."} for segment in segments):
        raise InvalidRepositoryPathError()
    if segments and segments[0] == ".hg":
        raise InvalidRepositoryPathError()
    if len(normalized) > 1024:
        raise InvalidRepositoryPathError()
    return normalized


def _parse_author(raw_author: str) -> tuple[str, str | None]:
    if "<" in raw_author and raw_author.endswith(">"):
        name, email = raw_author.rsplit("<", 1)
        return name.strip(), email[:-1].strip() or None
    return raw_author.strip(), None


def _language_hint(path: str) -> str | None:
    guess, _ = mimetypes.guess_type(path)
    if guess is None:
        suffix = PurePosixPath(path).suffix.lstrip(".")
        return suffix or None
    return guess


def _looks_binary(value: bytes) -> bool:
    return b"\x00" in value
