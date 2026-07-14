from __future__ import annotations

import mimetypes
import re
from pathlib import PurePosixPath

from mercurial import error as hgerror
from mercurial import hg, initialization
from mercurial import ui as uimod

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
    HgBlame,
    HgBlameLine,
    HgChangedFile,
    HgChangeset,
    HgChangesetPage,
    HgChangesetStats,
    HgDiff,
    HgDirectoryBrowse,
    HgFileBrowse,
    HgFileSearchMatch,
    HgReference,
    HgReferences,
    HgTreeEntry,
    mercurial_timestamp,
)

FULL_NODE_RE = re.compile(r"^[0-9a-f]{40}$")
SAFE_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$")

initialization.init()


class MercurialReadService:
    def __init__(self, *, settings: Settings, command_runner: HgCommandRunner) -> None:
        self._settings = settings
        self._command_runner = command_runner

    async def list_changesets(self, repository_path, *, cursor: str | None) -> HgChangesetPage:
        page_size = self._settings.max_history_page_size
        repo = self._open_repository(repository_path)
        if len(repo) == 0:
            return HgChangesetPage(changesets=[], next_cursor=None)

        if cursor is None:
            start_revision = len(repo) - 1
        else:
            start_revision = self._resolve_context(repo, cursor).rev() - 1

        if start_revision < 0:
            return HgChangesetPage(changesets=[], next_cursor=None)

        changesets: list[HgChangeset] = []
        for revision in range(start_revision, max(-1, start_revision - (page_size + 1)), -1):
            changesets.append(
                await self._build_changeset(repository_path, repo[revision], include_files=True)
            )
        next_cursor = changesets[page_size - 1].node if len(changesets) > page_size else None
        return HgChangesetPage(changesets=changesets[:page_size], next_cursor=next_cursor)

    async def get_changeset(self, repository_path, revision: str) -> HgChangeset:
        repo = self._open_repository(repository_path)
        return await self._build_changeset(
            repository_path,
            self._resolve_context(repo, revision),
            include_files=True,
        )

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
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        files = [] if ctx is None else self._manifest_paths(ctx)
        node = "" if ctx is None else _decode_ascii_bytes(ctx.hex())
        if ctx is None:
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

    async def get_blame(self, repository_path, *, revision: str | None, path: str) -> HgBlame:
        normalized_path = validate_repository_relative_path(path)
        repo = self._open_repository(repository_path)
        node = await self.resolve_revision(repository_path, revision)
        try:
            payload = await self._command_runner.run_json(
                ["annotate", "-Tjson", "-unf", "-r", node, "--", normalized_path],
                repository_path=repository_path,
                stdout_limit=max(
                    self._settings.max_file_content_bytes * 4,
                    self._settings.hg_max_stdout_bytes,
                ),
            )
        except HgCommandFailedError as exc:
            if exc.code == "hg_missing_path":
                raise MercurialNotFoundError() from exc
            raise

        if not payload:
            raise MercurialNotFoundError()

        lines_payload = payload[0].get("lines", [])
        lines: list[HgBlameLine] = []
        for index, entry in enumerate(lines_payload, start=1):
            author_name, author_email = _parse_author(str(entry["user"]))
            rev = int(entry["rev"])
            resolved_ctx = repo[rev]
            full_node = _decode_ascii_bytes(resolved_ctx.hex())
            lines.append(
                HgBlameLine(
                    line_number=index,
                    revision=full_node,
                    short_revision=full_node[:12],
                    author_name=author_name,
                    author_email_when_available=author_email,
                    path=str(entry["path"]),
                    content=str(entry["line"]).rstrip("\n"),
                )
            )

        return HgBlame(revision=node, path=normalized_path, lines=lines)

    async def search_files(
        self,
        repository_path,
        *,
        revision: str | None,
        query: str,
        limit: int = 50,
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
        repo = self._open_repository(repository_path)
        ctx = self._default_or_requested_context(repo, revision)
        if ctx is None:
            raise MercurialNotFoundError()
        return _decode_ascii_bytes(ctx.hex())

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

    def _open_repository(self, repository_path):
        base_ui = uimod.ui.load()
        base_ui.setconfig(b"ui", b"nontty", b"true", b"revforge")
        try:
            return hg.repository(base_ui, bytes(str(repository_path), "utf-8"))
        except (hgerror.RepoError, FileNotFoundError) as exc:
            raise MercurialNotFoundError() from exc

    def _default_or_requested_context(self, repo, revision: str | None):
        if len(repo) == 0:
            return None
        if revision is None or revision == "":
            return repo[len(repo) - 1]
        return self._resolve_context(repo, revision)

    def _resolve_context(self, repo, revision: str):
        normalized_revision = revision.strip()
        if FULL_NODE_RE.fullmatch(normalized_revision):
            try:
                return repo[normalized_revision.encode("ascii")]
            except (hgerror.LookupError, hgerror.RepoLookupError, KeyError) as exc:
                raise MercurialNotFoundError() from exc
        if not SAFE_REF_RE.fullmatch(normalized_revision):
            raise InvalidRevisionError()

        branch_name = normalized_revision.encode("utf-8")
        if repo.branchmap().hasbranch(branch_name):
            branch_heads = repo.branchmap().branchheads(branch_name, closed=False)
            if branch_heads:
                return repo[branch_heads[0]]

        tag_node = repo.tags().get(branch_name)
        if tag_node is not None:
            return repo[tag_node]

        bookmark_node = repo._bookmarks.get(branch_name)
        if bookmark_node is not None:
            return repo[bookmark_node]

        raise MercurialNotFoundError()

    def _manifest_paths(self, ctx) -> list[str]:
        return [_decode_utf8_bytes(path) for path in ctx.manifest().keys()]

    def _parse_changeset_context(self, ctx, *, include_files: bool) -> HgChangeset:
        node = _decode_ascii_bytes(ctx.hex())
        author_name, author_email = _parse_author(_decode_utf8_bytes(ctx.user()))
        return HgChangeset(
            node=node,
            short_node=node[:12],
            parents=[
                _decode_ascii_bytes(parent.hex()) for parent in ctx.parents() if parent.rev() >= 0
            ],
            author_name=author_name,
            author_email_when_available=author_email,
            timestamp=mercurial_timestamp(list(ctx.date())),
            message=_decode_utf8_bytes(ctx.description()),
            branch=_decode_utf8_bytes(ctx.branch()),
            tags=[
                _decode_utf8_bytes(tag) for tag in ctx.tags() if _decode_utf8_bytes(tag) != "tip"
            ],
            bookmarks=[_decode_utf8_bytes(bookmark) for bookmark in ctx.bookmarks()],
            files_changed=(
                [_decode_utf8_bytes(path) for path in ctx.files()] if include_files else []
            ),
            revision_number=int(ctx.rev()),
        )

    async def _build_changeset(self, repository_path, ctx, *, include_files: bool) -> HgChangeset:
        changeset = self._parse_changeset_context(ctx, include_files=include_files)
        changeset.stats = await self._load_changeset_stats(repository_path, changeset.node)
        return changeset

    async def _load_changeset_stats(
        self,
        repository_path,
        node: str,
    ) -> HgChangesetStats | None:
        try:
            status_payload = await self._command_runner.run_json(
                ["status", "--change", node, "--copies", "-Tjson"],
                repository_path=repository_path,
                stdout_limit=self._settings.hg_max_stdout_bytes,
            )
            diff_result = await self._command_runner.run(
                ["diff", "--git", "-c", node],
                repository_path=repository_path,
                stdout_limit=self._settings.max_diff_bytes,
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
            changed_files = [
                HgChangedFile(
                    path=path,
                    status=status,
                    insertions=None,
                    deletions=None,
                    old_path=old_path,
                )
                for path, (status, old_path) in status_by_path.items()
                if status != "clean"
            ]

        files_changed = len(changed_files) if changed_files else None
        insertions = (
            sum(file.insertions or 0 for file in changed_files)
            if changed_files and all(file.insertions is not None for file in changed_files)
            else None
        )
        deletions = (
            sum(file.deletions or 0 for file in changed_files)
            if changed_files and all(file.deletions is not None for file in changed_files)
            else None
        )
        return HgChangesetStats(
            files_changed=files_changed,
            insertions=insertions,
            deletions=deletions,
            changed_files=changed_files,
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


def _decode_utf8_bytes(value: bytes) -> str:
    return value.decode("utf-8", errors="surrogateescape")


def _decode_ascii_bytes(value: bytes) -> str:
    return value.decode("ascii")


def _language_hint(path: str) -> str | None:
    guess, _ = mimetypes.guess_type(path)
    if guess is None:
        suffix = PurePosixPath(path).suffix.lstrip(".")
        return suffix or None
    return guess


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
