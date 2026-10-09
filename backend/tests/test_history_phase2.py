"""Phase 2 history, changeset, diff, refs and PR-diff backend against real hg repositories.

Covers the screen-map "Phase 2 changes" contract: literal in-process history filters on the
served view, bounded per-row stats, the shared diff model, refs state, rate-limit buckets,
I13 (push range in spool events), I15 (request-id validation, DataError poison files) and
I34 (PR revision pinning and merge-base diff), plus the read authorization matrix.
"""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import subprocess
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import UUID
from wsgiref.simple_server import make_server

import pytest
from repo_fixtures import (
    HG_EXECUTABLE,
    add_member,
    commit,
    create_org,
    create_repo,
    csrf,
    deactivate_user,
    grant,
    hg,
    hg_env,
    login,
    provision,
    register,
    repository_path,
    repository_record,
    run_async,
    update_repository,
    url,
)
from sqlalchemy import select, update
from sqlalchemy.exc import DataError

from app.api.deps import get_hg_command_runner
from app.core.config import get_settings
from app.core.request_id import safe_request_id
from app.mercurial import diff_model, transport_hooks
from app.mercurial import read_service as read_service_module
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.diff_model import DiffCaps, build_file_diffs
from app.mercurial.http_gateway_service import create_http_gateway_application
from app.models.pull_request import PullRequest
from app.models.repository_event import RepositoryEvent
from app.services.activity_presenter import present_activity
from app.services.event_spool import FileEventSpoolReader

OWNER = "owner@example.com"
ORG = "acme"
REPO = "hist"


# ---------------------------------------------------------------- fixtures


def _write(root: Path, relative: str, data: bytes | str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        target.write_text(data, encoding="utf-8")
    else:
        target.write_bytes(data)


def _node(root: Path) -> str:
    return hg(root, "log", "-r", ".", "-T", "{node}").stdout.decode()


def _seed(root: Path) -> dict[str, str]:
    nodes: dict[str, str] = {}
    _write(root, "a.txt", "one\ntwo\nthree\n")
    _write(root, "dir/b.txt", "b\n")
    _write(root, "sql/schema.sql", "-- comment\nCREATE TABLE x (id int);\n")
    _write(root, "run.sh", "echo hi\n")
    _write(root, "x b/y.txt", "first\n")
    nodes["c0"] = commit(root, "Initial import")
    _write(root, "a.txt", "one\nTWO\nthree\n")
    nodes["c1"] = commit(root, "Second: re:.* literal", user="Bob <bob@example.com>")
    # A secret changeset in the middle of history (own branch, then back to default).
    hg(root, "branch", "-q", "secret-br")
    _write(root, "secret.txt", "hidden\n")
    hg(root, "commit", "-A", "-q", "--secret", "-u", "Eve <eve@example.com>", "-m", "secret-marker")
    nodes["secret"] = _node(root)
    hg(root, "bookmark", "-q", "-r", nodes["secret"], "secret-bm")
    hg(root, "update", "-q", "-r", nodes["c1"])
    hg(root, "tag", "-q", "-r", nodes["c1"], "-u", "Alice <alice@example.com>", "v1.0")
    nodes["tag"] = _node(root)
    hg(root, "branch", "-q", "feature")
    _write(root, "feature.txt", "feature\n")
    nodes["feature"] = commit(root, "Feature work", user="Carol <carol@example.com>")
    hg(root, "update", "-q", "default")
    hg(root, "mv", "dir/b.txt", "dir/c.txt")
    hg(root, "cp", "a.txt", "a-copy.txt")
    nodes["rename"] = commit(root, "Rename and copy")
    hg(root, "bookmark", "-q", "-r", nodes["rename"], "bm")
    hg(root, "bookmark", "-q", "--inactive")
    os.chmod(root / "run.sh", 0o755)
    os.symlink("a.txt", root / "link")
    nodes["modes"] = commit(root, "Chmod and symlink")
    _write(root, "blob.bin", b"\x00\x01\x02BIN\x00" * 64)
    nodes["binary"] = commit(root, "Binary blob (mentions dir)")
    hg(root, "rm", "-q", "sql/schema.sql")
    nodes["delete"] = commit(root, "Delete sql")
    _write(root, "crlf.txt", b"alpha\r\nbeta\r\n")
    _write(root, "latin1.txt", b"caf\xe9\n")
    _write(root, "x b/y.txt", "second\n")
    nodes["text"] = commit(root, "CRLF, latin-1 and spaced path")
    hg(root, "merge", "-q", "feature")
    nodes["merge"] = commit(root, "Merge feature")
    hg(root, "branch", "-q", "open-br")
    _write(root, "open.txt", "o\n")
    nodes["open"] = commit(root, "Open branch work")
    hg(root, "update", "-q", "default")
    hg(root, "branch", "-q", "closed-br")
    _write(root, "closed.txt", "c\n")
    nodes["closed"] = commit(root, "Closed branch work")
    hg(root, "commit", "-q", "--close-branch", "-u", "Alice <alice@example.com>", "-m", "Close")
    nodes["close"] = _node(root)
    hg(root, "update", "-q", "default")
    return nodes


@pytest.fixture(scope="module")
def _template(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, str]]:
    # Seeding takes ~40 hg invocations; build it once and copy it into each test's repo.
    root = tmp_path_factory.mktemp("history-template") / "repo"
    root.mkdir()
    subprocess.run([HG_EXECUTABLE, "init", str(root)], check=True, env=hg_env())
    return root, _seed(root)


@pytest.fixture
def seeded(
    client: Any, session_factory: Any, _template: tuple[Path, dict[str, str]]
) -> dict[str, str]:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, REPO, "public")
    assert provision(client, ORG, REPO).status_code == 200
    template, nodes = _template
    target = repository_path(session_factory, REPO)
    shutil.rmtree(target / ".hg")
    shutil.copytree(template / ".hg", target / ".hg", symlinks=True)
    return dict(nodes)


class _ExplodingRunner(HgCommandRunner):
    async def run(self, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("hg must not be spawned")

    async def run_json(self, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("hg must not be spawned")


@pytest.fixture
def no_hg_processes(client: Any) -> Iterator[None]:
    client.app.dependency_overrides[get_hg_command_runner] = lambda: _ExplodingRunner(
        get_settings()
    )
    yield
    client.app.dependency_overrides.pop(get_hg_command_runner, None)


def _history(client: Any, **params: Any) -> Any:
    return client.get(url(ORG, REPO, "/changesets"), params={"limit": 50, **params})


def _nodes(response: Any) -> list[str]:
    assert response.status_code == 200, response.text
    return [row["node"] for row in response.json()["changesets"]]


def _row(client: Any, node: str) -> dict[str, Any]:
    for row in _history(client).json()["changesets"]:
        if row["node"] == node:
            return dict(row)
    raise AssertionError(f"{node} not listed")


# ---------------------------------------------------------------- filters


def test_branch_filter_is_exact_and_literal(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    assert _nodes(_history(client, branch="feature")) == [seeded["feature"]]
    # "tip" is a symbol, never a branch name: it must not resolve to tip's branch.
    tip_branch = _history(client, branch="tip")
    assert tip_branch.json() == {"changesets": [], "next_cursor": None, "scan_truncated": False}
    for literal in ("re:.*", "nope", "default()", "literal:default"):
        response = _history(client, branch=literal)
        assert response.status_code == 200, literal
        assert _nodes(response) == [], literal
    for invalid in ("bad\x01name", "x" * 256):
        assert _history(client, branch=invalid).status_code == 422, invalid


def test_author_filter_is_case_insensitive_literal(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    alice = _nodes(_history(client, author="ALICE"))
    assert seeded["c0"] in alice and seeded["c1"] not in alice
    assert _nodes(_history(client, author="bob@EXAMPLE")) == [seeded["c1"]]
    assert _nodes(_history(client, author="re:.*")) == []
    assert _history(client, author="x" * 101).status_code == 422
    assert _history(client, author="a\nb").status_code == 422


def test_message_filter_is_literal_and_matches_hex_prefixes(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    assert _nodes(_history(client, q="RE:.*")) == [seeded["c1"]]
    for injection in ('") or all() or ("', "') or all() or ('", "re:.*x", "all()"):
        assert _nodes(_history(client, q=injection)) == [], injection
    assert seeded["rename"] in _nodes(_history(client, q=seeded["rename"][:8]))
    assert seeded["rename"] in _nodes(_history(client, q=seeded["rename"][:8].upper()))
    for invalid in ("a", "x" * 201, "line\nbreak", "nul\x00"):
        assert _history(client, q=invalid).status_code == 422, repr(invalid)


def test_path_filter_matches_changed_files_not_messages(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    under_dir = _nodes(_history(client, path="dir"))
    assert set(under_dir) == {seeded["c0"], seeded["rename"]}
    # F4: "Binary blob (mentions dir)" mentions dir in its message but touches no file there.
    assert seeded["binary"] not in under_dir
    assert _nodes(_history(client, path="dir/c.txt")) == [seeded["rename"]]
    assert _nodes(_history(client, path="x b/y.txt")) == [seeded["text"], seeded["c0"]]
    for invalid in (
        "dir/../a.txt",
        "glob:*.txt",
        "re:.*",
        "set:added()",
        "listfile:/etc/passwd",
        "/etc/passwd",
        "a\x00b",
        "..",
        ".hg/store",
        "dir\\b.txt",
    ):
        assert _history(client, path=invalid).status_code == 422, invalid


def test_filters_combine_with_and(client: Any, seeded: dict[str, str]) -> None:
    assert _nodes(_history(client, author="alice", path="dir")) == [seeded["rename"], seeded["c0"]]
    assert _nodes(_history(client, author="bob", path="dir")) == []
    assert _nodes(_history(client, branch="default", q="rename")) == [seeded["rename"]]


def test_filtered_pagination_has_no_duplicates_or_gaps(client: Any, seeded: dict[str, str]) -> None:
    expected = _nodes(_history(client, author="alice"))
    assert len(expected) >= 6
    collected: list[str] = []
    cursor: str | None = None
    for _ in range(20):
        params: dict[str, Any] = {"author": "alice", "limit": 2}
        if cursor:
            params["cursor"] = cursor
        body = client.get(url(ORG, REPO, "/changesets"), params=params).json()
        collected.extend(row["node"] for row in body["changesets"])
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert collected == expected


def test_cursor_validation(client: Any, seeded: dict[str, str]) -> None:
    for invalid in ("default", "tip", seeded["c1"][:12], "all()", "X" * 40):
        response = _history(client, cursor=invalid)
        assert response.status_code == 422, invalid
        assert response.json()["error"]["code"] == "invalid_cursor"
    unknown = _history(client, cursor="e" * 40)
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "revision_not_found"
    hidden = _history(client, cursor=seeded["secret"])
    assert hidden.status_code == 404
    assert hidden.json()["error"]["code"] == "revision_not_found"


def test_scan_budget_truncates_with_resumable_cursor(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_HISTORY_SCAN_MAX_REVISIONS", "2")
    get_settings.cache_clear()
    first = _history(client, author="carol")
    assert first.status_code == 200
    body = first.json()
    assert body["changesets"] == []
    assert body["scan_truncated"] is True
    assert body["next_cursor"] is not None

    found: list[str] = []
    cursors: list[str] = []
    cursor = body["next_cursor"]
    for _ in range(30):
        cursors.append(cursor)
        page = _history(client, author="carol", cursor=cursor).json()
        found.extend(row["node"] for row in page["changesets"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert found == [seeded["feature"]]
    assert seeded["secret"] not in cursors  # the hidden revision is never a cursor


def test_scan_deadline_truncates(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(read_service_module, "_HISTORY_WINDOW", 2)
    monkeypatch.setenv("REVFORGE_HISTORY_SCAN_TIMEOUT_SECONDS", "0.000001")
    get_settings.cache_clear()
    body = _history(client, author="carol").json()
    assert body["scan_truncated"] is True
    assert body["next_cursor"] is not None
    assert body["next_cursor"] != seeded["secret"]


def test_secret_changesets_never_appear(client: Any, seeded: dict[str, str]) -> None:
    secret = seeded["secret"]
    for params in (
        {},
        {"q": "secret-marker"},
        {"q": secret[:10]},
        {"author": "eve"},
        {"path": "secret.txt"},
        {"branch": "secret-br"},
        {"branch": "default"},
        {"limit": 1},
    ):
        response = _history(client, **params)
        assert response.status_code == 200, params
        assert secret not in response.text, params
        assert "secret-marker" not in response.text, params
    assert client.get(url(ORG, REPO, f"/changesets/{secret}/diff")).status_code == 404
    assert client.get(url(ORG, REPO, f"/changesets/{secret}")).status_code == 404
    refs = client.get(url(ORG, REPO, "/refs"), params={"include_closed": "true"})
    assert secret not in refs.text
    assert "secret-bm" not in refs.text and "secret-br" not in refs.text


# ---------------------------------------------------------------- per-row data


def test_history_rows_carry_refs_flags_and_stats(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    c1 = _row(client, seeded["c1"])
    assert c1["tags"] == ["v1.0"]
    assert c1["insertions_when_available"] == 1 and c1["deletions_when_available"] == 1
    assert c1["is_branch_head"] is False and c1["is_merge"] is False
    assert "tip" not in _row(client, seeded["close"])["tags"]
    assert _row(client, seeded["rename"])["bookmarks"] == ["bm"]

    merge = _row(client, seeded["merge"])
    assert merge["is_merge"] is True
    # Stats are against p1 (default): the merge brings in feature.txt only.
    assert merge["files_changed_count_when_available"] == 1
    assert merge["insertions_when_available"] == 1
    assert merge["is_branch_head"] is True

    binary = _row(client, seeded["binary"])
    assert binary["has_binary"] is True and binary["stats_too_large"] is False

    rename = _row(client, seeded["rename"])
    assert rename["files_changed_count_when_available"] == 2  # rename + copy
    assert rename["insertions_when_available"] == 0 and rename["deletions_when_available"] == 0

    assert _row(client, seeded["close"])["is_branch_head"] is True


def test_over_budget_rows_report_stats_too_large_without_diffing(
    client: Any,
    seeded: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    no_hg_processes: None,
) -> None:
    def no_diff(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("over-budget rows must not be diffed")

    monkeypatch.setattr(read_service_module, "_STATS_ROW_INPUT_BYTES", 1)
    monkeypatch.setattr(read_service_module.patch, "diffstatdata", no_diff)
    rows = _history(client, q=seeded["c0"][:12]).json()["changesets"]
    assert [item["node"] for item in rows] == [seeded["c0"]]
    row = rows[0]
    assert row["stats_too_large"] is True
    assert row["insertions_when_available"] is None
    assert row["deletions_when_available"] is None
    assert row["files_changed_count_when_available"] == 5

    monkeypatch.setattr(read_service_module, "_STATS_ROW_INPUT_BYTES", 10**9)
    monkeypatch.setattr(read_service_module, "_STATS_MAX_FILES", 1)
    rows = _history(client, q=seeded["c0"][:12]).json()["changesets"]
    assert rows[0]["stats_too_large"] is True


# ---------------------------------------------------------------- diff model / endpoints


def _diff(client: Any, node: str) -> dict[str, Any]:
    response = client.get(url(ORG, REPO, f"/changesets/{node}/diff"))
    assert response.status_code == 200, response.text
    return dict(response.json())


def _files(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["path"]: item for item in body["files"]}


def test_diff_rename_copy_and_modes(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    files = _files(_diff(client, seeded["rename"]))
    assert files["dir/c.txt"]["status"] == "renamed"
    assert files["dir/c.txt"]["old_path"] == "dir/b.txt"
    assert "dir/b.txt" not in files
    assert files["a-copy.txt"]["status"] == "copied"
    assert files["a-copy.txt"]["old_path"] == "a.txt"

    files = _files(_diff(client, seeded["modes"]))
    assert files["run.sh"]["old_mode"] == "100644" and files["run.sh"]["new_mode"] == "100755"
    assert files["run.sh"]["status"] == "modified"
    assert files["link"]["status"] == "added"
    assert files["link"]["new_mode"] == "120000" and files["link"]["old_mode"] is None
    hunk = files["link"]["hunks"][0]
    assert [line["kind"] for line in hunk["lines"]] == ["add", "meta"]
    assert hunk["lines"][0] == {"kind": "add", "old_line": None, "new_line": 1, "text": "a.txt"}


def test_diff_binary_is_flagged_never_base85(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    body = _diff(client, seeded["binary"])
    blob = _files(body)["blob.bin"]
    assert blob["binary"] is True and blob["hunks"] == []
    assert "GIT binary patch" not in body["content"]
    assert "literal " not in body["content"]
    assert "Binary file blob.bin has changed" in body["content"]


def test_diff_deletion_counts_sql_comment_lines(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    removed = _files(_diff(client, seeded["delete"]))["sql/schema.sql"]
    assert removed["status"] == "removed" and removed["new_mode"] is None
    assert removed["deletions"] == 2
    assert [line["text"] for line in removed["hunks"][0]["lines"]] == [
        "-- comment",
        "CREATE TABLE x (id int);",
    ]
    # Regression: the old --git parser treated the deleted "-- comment" line ("--- comment")
    # as a file header and keyed on "diff -r ", falling back to one hg process per file.
    detail = client.get(url(ORG, REPO, f"/changesets/{seeded['delete']}"))
    assert detail.status_code == 200
    changed = {item["path"]: item for item in detail.json()["changed_files"]}
    assert changed["sql/schema.sql"]["status"] == "deleted"
    assert changed["sql/schema.sql"]["deletions"] == 2
    assert detail.json()["deletions_when_available"] == 2


def test_diff_spaced_path_crlf_and_non_utf8(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    files = _files(_diff(client, seeded["text"]))
    assert files["x b/y.txt"]["status"] == "modified"
    assert files["x b/y.txt"]["insertions"] == 1 and files["x b/y.txt"]["deletions"] == 1
    crlf = [line["text"] for line in files["crlf.txt"]["hunks"][0]["lines"]]
    assert crlf == ["alpha", "beta"]
    latin1 = files["latin1.txt"]["hunks"][0]["lines"][0]
    assert latin1["text"] == "caf�"
    detail = client.get(url(ORG, REPO, f"/changesets/{seeded['text']}")).json()
    assert {item["path"] for item in detail["changed_files"]} == {
        "crlf.txt",
        "latin1.txt",
        "x b/y.txt",
    }


def test_changeset_detail_uses_diff_model_with_bounded_hg_work(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    detail = client.get(url(ORG, REPO, f"/changesets/{seeded['modes']}"))
    assert detail.status_code == 200, detail.text
    changed = {item["path"]: item for item in detail.json()["changed_files"]}
    assert changed["run.sh"]["old_mode"] == "100644"
    assert changed["run.sh"]["new_mode"] == "100755"
    assert changed["link"]["binary"] is False
    binary = client.get(url(ORG, REPO, f"/changesets/{seeded['binary']}")).json()
    assert binary["changed_files"][0]["binary"] is True
    rename = client.get(url(ORG, REPO, f"/changesets/{seeded['rename']}")).json()
    renamed = {item["path"]: item for item in rename["changed_files"]}["dir/c.txt"]
    assert renamed["status"] == "renamed" and renamed["old_path"] == "dir/b.txt"


def test_diff_unknown_or_hidden_node_is_404(client: Any, seeded: dict[str, str]) -> None:
    for node in ("e" * 40, seeded["secret"], seeded["secret"][:12]):
        response = client.get(url(ORG, REPO, f"/changesets/{node}/diff"))
        assert response.status_code == 404, node
    assert client.get(url(ORG, REPO, "/changesets/all()/diff")).status_code == 422


def test_diff_file_line_and_byte_caps(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(diff_model, "DEFAULT_MAX_FILES", 1)
    body = _diff(client, seeded["text"])
    assert body["files_truncated"] is True and len(body["files"]) == 1
    monkeypatch.setattr(diff_model, "DEFAULT_MAX_FILES", 300)

    monkeypatch.setattr(diff_model, "DEFAULT_MAX_LINES_PER_FILE", 1)
    removed = _files(_diff(client, seeded["delete"]))["sql/schema.sql"]
    assert removed["truncated"] is True
    assert len(removed["hunks"][0]["lines"]) == 1
    assert removed["deletions"] == 2  # counts stay exact past the line cap
    monkeypatch.setattr(diff_model, "DEFAULT_MAX_LINES_PER_FILE", 5000)

    monkeypatch.setattr(diff_model, "DEFAULT_MAX_LINE_CHARS", 3)
    removed = _files(_diff(client, seeded["delete"]))["sql/schema.sql"]
    assert removed["hunks"][0]["lines"][0]["text"] == "-- "
    assert removed["truncated"] is True
    monkeypatch.setattr(diff_model, "DEFAULT_MAX_LINE_CHARS", 2000)

    monkeypatch.setenv("REVFORGE_MAX_DIFF_BYTES", "64")
    get_settings.cache_clear()
    body = _diff(client, seeded["c0"])
    assert body["is_truncated"] is True
    assert body["truncation_reason_when_applicable"] == "diff_too_large"
    assert len(body["content"].encode()) <= 64

    monkeypatch.setenv("REVFORGE_MAX_DIFF_BYTES", "65536")
    monkeypatch.setenv("REVFORGE_DIFF_MAX_FILE_INPUT_BYTES", "4")
    get_settings.cache_clear()
    files = _files(_diff(client, seeded["c0"]))
    assert files["a.txt"]["too_large"] is True and files["a.txt"]["hunks"] == []


def test_build_file_diffs_never_reads_oversized_files(
    seeded: dict[str, str], session_factory: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from mercurial import hg as hgmod
    from mercurial import ui as uimod

    root = repository_path(session_factory, REPO)
    repo = hgmod.repository(uimod.ui(), str(root).encode()).filtered(b"served")
    ctx = repo[seeded["c0"].encode()]
    seen: list[Any] = []
    original = diff_model.patch.diffhunks

    def spy(*args: Any, **kwargs: Any) -> Any:
        seen.append(kwargs.get("match"))
        return original(*args, **kwargs)

    monkeypatch.setattr(diff_model.patch, "diffhunks", spy)
    result = build_file_diffs(repo, ctx.p1(), ctx, DiffCaps(max_file_input_bytes=10))
    by_path = {item.path: item for item in result.files}
    assert by_path["sql/schema.sql"].too_large is True
    assert by_path["dir/b.txt"].too_large is False
    matcher = seen[0]
    assert matcher(b"dir/b.txt") and not matcher(b"sql/schema.sql")

    deadline = build_file_diffs(repo, ctx.p1(), ctx, DiffCaps(timeout_seconds=-1))
    assert deadline.files_truncated is True
    assert all(item.hunks == [] for item in deadline.files)


# ---------------------------------------------------------------- refs


def test_refs_state_dates_summaries_and_closed(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    body = client.get(url(ORG, REPO, "/refs")).json()
    branches = {item["name"]: item for item in body["branches"]}
    assert set(branches) == {"default", "feature", "open-br"}
    assert branches["default"]["state"] == "open"
    assert branches["feature"]["state"] == "merged"
    assert branches["open-br"]["state"] == "open"
    assert branches["open-br"]["summary"] == "Open branch work"
    assert branches["open-br"]["updated_at"] is not None
    tags = {item["name"]: item for item in body["tags"]}
    assert tags["v1.0"]["node"] == seeded["c1"]
    assert tags["v1.0"]["summary"] == "Second: re:.* literal"
    assert tags["v1.0"]["state"] is None
    assert [item["name"] for item in body["bookmarks"]] == ["bm"]

    with_closed = client.get(url(ORG, REPO, "/refs"), params={"include_closed": "true"}).json()
    closed = {item["name"]: item for item in with_closed["branches"]}
    assert closed["closed-br"]["state"] == "closed"
    assert closed["closed-br"]["node"] == seeded["close"]


# ---------------------------------------------------------------- rate limits


@pytest.mark.parametrize(
    ("first", "suffix", "params"),
    [
        ("history", "/changesets", {}),
        ("history_filter", "/changesets", {"q": "work"}),
        ("history_filter", "/changesets", {"path": "dir"}),
        ("changeset", "/changesets/{c1}", {}),
        ("changeset_diff", "/changesets/{c1}/diff", {}),
    ],
)
def test_phase2_rate_limit_buckets(
    client: Any,
    seeded: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    first: str,
    suffix: str,
    params: dict[str, str],
) -> None:
    monkeypatch.setenv("REVFORGE_READ_RATE_LIMIT_MAX_REQUESTS", "1")
    get_settings.cache_clear()
    target = url(ORG, REPO, suffix.format(c1=seeded["c1"]))
    assert client.get(target, params=params).status_code == 200
    limited = client.get(target, params=params)
    assert limited.status_code == 429, first
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) >= 1
    if first == "history":
        # Plain history and content-scanning filters are separate buckets.
        assert client.get(target, params={"author": "alice"}).status_code == 200


# ---------------------------------------------------------------- I34 pull requests


def _pr_url(suffix: str = "") -> str:
    return url(ORG, REPO, f"/pull-requests{suffix}")


def _create_pr(client: Any, source: str, target: str) -> Any:
    return client.post(
        _pr_url(),
        json={"title": "Change", "source_revision": source, "target_revision": target},
        headers=csrf(client),
    )


def test_pr_create_rejects_revsets_and_pins_full_nodes(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    for revset in ("secret()", "all()", 'grep("(a*)*b")', "default or tip", "0", "e" * 40):
        response = _create_pr(client, revset, "default")
        assert response.status_code == 422, (revset, response.text)
        assert response.json()["error"]["code"] == "invalid_revision"
    hidden = _create_pr(client, seeded["secret"], "default")
    assert hidden.status_code == 422
    assert seeded["secret"] not in hidden.text

    created = _create_pr(client, seeded["rename"][:8], "v1.0")
    assert created.status_code == 201, created.text
    assert created.json()["source_revision"] == seeded["rename"]
    assert created.json()["target_revision"] == seeded["c1"]
    by_branch = _create_pr(client, "feature", "default")
    assert by_branch.json()["source_revision"] == seeded["feature"]


def test_pr_diff_uses_merge_base_and_reports_flags(
    client: Any, seeded: dict[str, str], no_hg_processes: None
) -> None:
    created = _create_pr(client, seeded["binary"], seeded["c1"])
    pr_id = created.json()["id"]
    response = client.get(_pr_url(f"/{pr_id}/diff"))
    assert response.status_code == 200, response.text
    body = response.json()
    files = {item["path"]: item for item in body["changed_files"]}
    assert files["dir/c.txt"]["status"] == "renamed"
    assert files["dir/c.txt"]["old_path"] == "dir/b.txt"
    assert files["blob.bin"]["binary"] is True
    assert files["a-copy.txt"]["status"] == "copied"
    assert "secret.txt" not in files and "feature.txt" not in files
    assert body["total_files"] == len(files)

    # The merge base (not the target head) is the diff base: a target that moved on
    # (feature) does not show its own changes as reverted.
    divergent = _create_pr(client, seeded["rename"], seeded["feature"]).json()["id"]
    paths = {
        item["path"] for item in client.get(_pr_url(f"/{divergent}/diff")).json()["changed_files"]
    }
    assert "feature.txt" not in paths and "dir/c.txt" in paths


def test_pr_diff_unknown_or_legacy_revision(
    client: Any, seeded: dict[str, str], session_factory: Any
) -> None:
    pr_id = _create_pr(client, seeded["rename"], seeded["c0"]).json()["id"]

    def set_source(value: str) -> None:
        async def runner() -> None:
            async with session_factory() as session:
                await session.execute(
                    update(PullRequest)
                    .where(PullRequest.id == UUID(pr_id))
                    .values(source_revision=value)
                )
                await session.commit()

        run_async(runner())

    for unknown in ("e" * 40, seeded["secret"], "all()", "no-such-branch"):
        set_source(unknown)
        response = client.get(_pr_url(f"/{pr_id}/diff"))
        assert response.status_code == 404, (unknown, response.text)
        assert response.json()["error"]["code"] == "revision_not_found"
    set_source("bm")  # legacy stored ref: resolved through the same served-view resolver
    assert client.get(_pr_url(f"/{pr_id}/diff")).status_code == 200


def test_pr_diff_rate_limit(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    pr_id = _create_pr(client, seeded["rename"], seeded["c0"]).json()["id"]
    monkeypatch.setenv("REVFORGE_READ_RATE_LIMIT_MAX_REQUESTS", "1")
    get_settings.cache_clear()
    assert client.get(_pr_url(f"/{pr_id}/diff")).status_code == 200
    limited = client.get(_pr_url(f"/{pr_id}/diff"))
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) >= 1


def test_pr_merge_resolves_in_process(client: Any, seeded: dict[str, str]) -> None:
    reviewer = "reviewer@example.com"
    register(client, reviewer)
    login(client, OWNER)
    add_member(client, ORG, reviewer)
    grant(client, ORG, REPO, reviewer, "write")
    pr_id = _create_pr(client, seeded["feature"], "default").json()["id"]
    login(client, reviewer)
    review = client.post(
        _pr_url(f"/{pr_id}/reviews"), json={"decision": "approved"}, headers=csrf(client)
    )
    assert review.status_code in (200, 201), review.text
    merged = client.post(_pr_url(f"/{pr_id}/merge"), headers=csrf(client))
    assert merged.status_code == 200, merged.text
    # The target was pinned at creation (the default head then), which contains feature.
    assert merged.json()["merged_revision"] == seeded["merge"]


# ---------------------------------------------------------------- authorization matrix


def _matrix_requests(client: Any, repo: str, pr_id: str | None) -> dict[str, int]:
    base = f"/api/v1/organizations/{ORG}/repositories/{repo}"
    statuses = {
        "filtered": client.get(f"{base}/changesets", params={"q": "seed"}).status_code,
        "diff": client.get(f"{base}/changesets/default/diff").status_code,
        "refs": client.get(f"{base}/refs").status_code,
    }
    if pr_id is not None:
        statuses["pr_diff"] = client.get(f"{base}/pull-requests/{pr_id}/diff").status_code
    return statuses


def test_phase2_read_authorization_matrix(client: Any, session_factory: Any) -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "private-repo", "private")
    assert provision(client, ORG, "private-repo").status_code == 200
    root = repository_path(session_factory, "private-repo")
    _write(root, "README.md", "seed\n")
    commit(root, "seed")
    create_repo(client, ORG, "public-repo", "public")
    assert provision(client, ORG, "public-repo").status_code == 200
    public_root = repository_path(session_factory, "public-repo")
    _write(public_root, "README.md", "seed\n")
    commit(public_root, "seed")
    create_repo(client, ORG, "pending", "public")

    pr_private = client.post(
        f"{API_REPO('private-repo')}/pull-requests",
        json={"title": "t", "source_revision": "default", "target_revision": "default"},
        headers=csrf(client),
    ).json()["id"]
    pr_public = client.post(
        f"{API_REPO('public-repo')}/pull-requests",
        json={"title": "t", "source_revision": "default", "target_revision": "default"},
        headers=csrf(client),
    ).json()["id"]

    for email in ("reader@example.com", "writer@example.com", "admin@example.com"):
        register(client, email)
    register(client, "outsider@example.com")
    register(client, "inactive@example.com")
    login(client, OWNER)
    for email, role in (
        ("reader@example.com", "read"),
        ("writer@example.com", "write"),
        ("admin@example.com", "admin"),
        ("inactive@example.com", "read"),
    ):
        add_member(client, ORG, email)
        grant(client, ORG, "private-repo", email, role)
    login(client, "outsider@example.com")
    create_org(client, "other")

    def expect(expected: int, repo: str = "private-repo", pr: str | None = pr_private) -> None:
        statuses = _matrix_requests(client, repo, pr)
        assert set(statuses.values()) == {expected}, (repo, statuses)

    for email in ("reader@example.com", "writer@example.com", "admin@example.com", OWNER):
        login(client, email)
        expect(200)

    client.cookies.clear()
    expect(200, "public-repo", pr_public)  # anonymous on public
    expect(404)  # anonymous on private
    login(client, "outsider@example.com")
    expect(404)  # wrong organization
    login(client, "inactive@example.com")
    deactivate_user(session_factory, "inactive@example.com")
    expect(404)  # inactive session = anonymous
    login(client, OWNER)
    expect(409, "pending", None)
    assert (
        client.get(url(ORG, "pending", "/changesets"), params={"q": "seed"}).json()["error"]["code"]
        == "repository_not_ready"
    )

    archive = client.patch(url(ORG, "private-repo"), json={"archived": True}, headers=csrf(client))
    assert archive.status_code == 200
    login(client, "reader@example.com")
    expect(200)  # archived repositories stay readable

    # A PR whose repository later loses its storage readiness reports 409, not 500.
    update_repository(session_factory, "public-repo", provisioning_state="failed")
    client.cookies.clear()
    response = client.get(f"{API_REPO('public-repo')}/pull-requests/{pr_public}/diff")
    assert response.status_code in (404, 409)


def API_REPO(repo: str) -> str:  # noqa: N802 - mirrors the url() helper
    return f"/api/v1/organizations/{ORG}/repositories/{repo}"


# ---------------------------------------------------------------- I13 push range


@contextlib.contextmanager
def _serve(app: Any) -> Iterator[tuple[str, int]]:
    server = make_server("127.0.0.1", 0, app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "127.0.0.1", server.server_port
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def _client_hg(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [HG_EXECUTABLE, *args], cwd=cwd, env=hg_env(), capture_output=True, text=True
    )


def _push_three_commits_and_a_branch(
    client: Any, session_factory: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[list[str], list[dict[str, Any]]]:
    spool = tmp_path / "spool"
    monkeypatch.setenv("REVFORGE_EVENT_SPOOL_DIR", str(spool))
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "pushy", "public")
    assert provision(client, ORG, "pushy").status_code == 200
    root = repository_path(session_factory, "pushy")
    _write(root, "README.md", "seed\n")
    commit(root, "seed")
    token = client.post(
        "/api/v1/me/tokens", json={"name": "push", "capability": "write"}, headers=csrf(client)
    ).json()["plaintext_token"]
    gateway = create_http_gateway_application(
        settings=get_settings(), session_factory_getter=lambda: session_factory
    )
    with _serve(gateway) as (host, port):
        clone = tmp_path / "clone"
        result = _client_hg("clone", f"http://{host}:{port}/{ORG}/pushy", str(clone), cwd=tmp_path)
        assert result.returncode == 0, result.stderr
        pushed: list[str] = []
        for index in range(3):
            _write(clone, f"f{index}.txt", f"{index}\n")
            pushed.append(commit(clone, f"commit {index}"))
        hg(clone, "branch", "-q", "topic")
        _write(clone, "topic.txt", "t\n")
        pushed.append(commit(clone, "new branch"))
        push_url = f"http://{quote(OWNER, safe='')}:{token}@{host}:{port}/{ORG}/pushy"
        result = _client_hg("push", "--new-branch", push_url, cwd=clone)
        assert result.returncode == 0, result.stderr
    events = [json.loads(path.read_text()) for path in sorted(spool.glob("*.json"))]
    return pushed, events


def test_http_push_spools_full_range_oldest_first(
    client: Any, session_factory: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pushed, events = _push_three_commits_and_a_branch(
        client, session_factory, tmp_path, monkeypatch
    )
    assert len(events) == 1
    event = events[0]
    assert event["pushed_nodes"] == pushed
    assert event["pushed_count"] == 4
    assert event["pushed_nodes_truncated"] is False

    reader = FileEventSpoolReader(str(tmp_path / "spool"))

    async def importer() -> list[RepositoryEvent]:
        async with session_factory() as session:
            await reader.import_to_db(session)
            return list((await session.execute(select(RepositoryEvent))).scalars())

    stored = run_async(importer())
    assert stored[0].payload_json["pushed_count"] == 4
    assert stored[0].payload_json["pushed_nodes"] == pushed
    presented = present_activity("repository.push.accepted", stored[0].payload_json)
    assert presented.summary == "Push accepted: 4 changesets"


def test_http_push_range_is_capped(
    client: Any, session_factory: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(transport_hooks, "MAX_PUSHED_NODES", 2)
    pushed, events = _push_three_commits_and_a_branch(
        client, session_factory, tmp_path, monkeypatch
    )
    assert events[0]["pushed_nodes"] == pushed[:2]
    assert events[0]["pushed_count"] == 4
    assert events[0]["pushed_nodes_truncated"] is True


def test_push_range_falls_back_to_first_node(tmp_path: Path) -> None:
    class Broken:
        def unfiltered(self) -> Any:
            raise RuntimeError("boom")

    class FakeUi:
        def __init__(self, spool: Path) -> None:
            self.values = {b"event_spool_dir": str(spool).encode(), b"request_id": b"x" * 65}

        def config(self, section: bytes, name: bytes, default: Any = None) -> Any:
            return self.values.get(name, default)

    spool = tmp_path / "spool"
    node = "a" * 40
    transport_hooks.spool_push_event(
        ui=FakeUi(spool), repo=Broken(), hooktype=b"changegroup", node=node, node_last="b" * 40
    )
    event = json.loads(next(spool.glob("*.json")).read_text())
    assert event["pushed_nodes"] == [node] and event["pushed_count"] == 1
    assert len(event["request_id"]) == 36  # overlong id replaced in the hook too


def test_presenter_uses_pushed_count_with_legacy_fallback() -> None:
    modern = present_activity(
        "repository.push.accepted",
        {"pushed_nodes": ["a" * 40], "pushed_count": 1500, "pushed_nodes_truncated": True},
    )
    assert modern.summary == "Push accepted: 1500 changesets"
    assert [detail.value for detail in modern.details] == ["1500"]
    legacy = present_activity("repository.push.accepted", {"pushed_nodes": ["a" * 40] * 3})
    assert legacy.summary == "Push accepted: 3 changesets"


# ---------------------------------------------------------------- I15 request ids


def test_request_id_validation() -> None:
    assert safe_request_id("abc-123:x.y_z") == "abc-123:x.y_z"
    for junk in ("x" * 65, "bad id", "a/b", "", None, "é", b"\xff", "id\n"):
        value = safe_request_id(junk)
        assert len(value) == 36 and value != junk


def test_api_replaces_invalid_request_ids(client: Any) -> None:
    kept = client.get("/api/v1/health", headers={"X-Request-ID": "trace-1:ok"})
    assert kept.headers["x-request-id"] == "trace-1:ok"
    for junk in ("x" * 65, "has space", "semi;colon", "<script>"):
        response = client.get("/api/v1/health", headers={"X-Request-ID": junk})
        assert response.headers["x-request-id"] != junk
        assert len(response.headers["x-request-id"]) == 36


def test_http_gateway_replaces_invalid_request_ids(client: Any, session_factory: Any) -> None:
    gateway = create_http_gateway_application(
        settings=get_settings(), session_factory_getter=lambda: session_factory
    )
    captured: dict[str, Any] = {}

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: Any = None) -> Any:
        captured["headers"] = dict(headers)
        return lambda data: None

    environ = {
        "REQUEST_METHOD": "GET",
        "PATH_INFO": "/only-one-segment",
        "QUERY_STRING": "",
        "HTTP_X_REQUEST_ID": "y" * 200,
        "wsgi.url_scheme": "http",
    }
    list(gateway(environ, start_response))
    assert len(captured["headers"]["X-Request-ID"]) == 36


def test_spool_data_error_is_dropped_and_next_file_imported(
    session_factory: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, client: Any
) -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "spooled", "public")
    repository_id = str(repository_record(session_factory, "spooled").id)
    spool = tmp_path / "spool"
    spool.mkdir()
    for name in ("a-poison", "b-good"):
        (spool / f"{name}.json").write_text(
            json.dumps(
                {
                    "event_type": "repository.push.accepted",
                    "repository_id": repository_id,
                    "request_id": name,
                    "pushed_nodes": ["c" * 40],
                }
            )
        )
    reader = FileEventSpoolReader(str(spool))

    async def run() -> list[RepositoryEvent]:
        async with session_factory() as session:
            original_commit = session.commit
            calls = {"count": 0}

            async def flaky_commit() -> None:
                calls["count"] += 1
                if calls["count"] == 1:
                    raise DataError("INSERT", {}, Exception("value too long"))
                await original_commit()

            monkeypatch.setattr(session, "commit", flaky_commit)
            imported = await reader.import_to_db(session)
            assert imported == 1
            return list((await session.execute(select(RepositoryEvent))).scalars())

    events = run_async(run())
    assert [event.request_id for event in events] == ["b-good"]
    assert list(spool.glob("*.json")) == []  # poison file dropped, not retried forever
