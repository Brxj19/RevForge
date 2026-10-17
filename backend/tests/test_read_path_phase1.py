"""Phase 1 repository read path against real hg repositories.

Covers I11 (short hashes), branch-tip/lookup-order fixes, served-view hiding of secret
changesets, browse/blame field additions, and the new raw, search/code and stats endpoints
with their security controls and authorization matrix.
"""

from __future__ import annotations

import os
import struct
import time
import zlib
from pathlib import Path
from typing import Any

import pytest
from repo_fixtures import (
    add_member,
    commit,
    create_org,
    create_repo,
    csrf,
    deactivate_user,
    grant,
    hg,
    login,
    provision,
    register,
    repository_path,
    update_repository,
    url,
)

from app.api.deps import get_hg_command_runner, get_mercurial_read_service
from app.core.config import get_settings
from app.mercurial import read_service as read_service_module
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.errors import RevisionAmbiguousError

OWNER = "owner@example.com"
ORG = "acme"
REPO = "graph"


def _png_bytes() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0)
    pixels = zlib.compress(b"\x00\x00")
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")
    )


def _write(root: Path, relative: str, data: bytes | str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        target.write_text(data, encoding="utf-8")
    else:
        target.write_bytes(data)


def _seed(root: Path) -> dict[str, str]:
    """Build a repository with every content kind, two release heads and a secret head."""
    _write(root, "src/main.cpp", "int main() {\n  return 0;\n}\n")
    _write(root, "README.md", "# Graph\n\nSee [docs](docs/guide.md).\n")
    _write(root, "assets/logo.png", _png_bytes())
    _write(root, "assets/fake.png", "<script>alert(1)</script>\n")
    _write(root, "fonts/inter.woff2", b"wOF2\x00\x01\x00\x00fontdata")
    _write(root, "web/index.html", "<html><script>alert(document.cookie)</script></html>\n")
    _write(root, "web/icon.svg", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>\n')
    _write(root, "data/feed.xml", "<?xml version='1.0'?><feed/>\n")
    _write(root, "bin/blob.bin", b"\x00\x01\x02REVFORGE\x00")
    _write(root, "docs/latin1.txt", b"caf\xe9 au lait\n")
    _write(root, "docs/naïve résumé.md", "# Unicode path\n")
    _write(root, "docs/big.txt", "x" * 40_000 + "\n")
    _write(
        root,
        "notes/flags.txt",
        "run with --config=evil\nregex (a+)+$ stays literal\nStraße and STRASSE\n",
    )
    os.symlink("README.md", root / "readme-link")
    nodes: dict[str, str] = {}
    nodes["initial"] = commit(root, "Initial import")
    _write(root, "src/main.cpp", "int main() {\n  return 42;\n}\n")
    nodes["second"] = commit(root, "Second change\n\nWith a body", user="Bob <bob@example.com>")
    hg(root, "tag", "-q", "-r", nodes["initial"], "-u", "Alice <alice@example.com>", "v1.0")
    nodes["tagged"] = hg(root, "log", "-r", ".", "-T", "{node}").stdout.decode()
    hg(root, "branch", "-q", "release")
    _write(root, "release.txt", "base\n")
    nodes["release_base"] = commit(root, "Release base")
    _write(root, "release.txt", "head a\n")
    nodes["release_a"] = commit(root, "Release head A")
    hg(root, "update", "-q", "-r", nodes["release_base"])
    _write(root, "release-b.txt", "head b\n")
    nodes["release_b"] = commit(root, "Release head B")
    hg(root, "update", "-q", "-r", nodes["tagged"])
    _write(root, "secret.txt", "do not show\n")
    hg(root, "commit", "-A", "-q", "--secret", "-u", "Eve <eve@example.com>", "-m", "Secret work")
    nodes["secret"] = hg(root, "log", "-r", ".", "-T", "{node}").stdout.decode()
    return nodes


@pytest.fixture
def seeded(client: Any, session_factory: Any) -> dict[str, str]:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, REPO, "public")
    assert provision(client, ORG, REPO).status_code == 200
    return _seed(repository_path(session_factory, REPO))


class _RecordingRunner(HgCommandRunner):
    calls: list[list[str]] = []

    async def run(self, args: Any, **kwargs: Any) -> Any:
        _RecordingRunner.calls.append(list(args))
        return await super().run(args, **kwargs)


class _ExplodingRunner:
    async def run(self, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("hg must not be spawned")

    async def run_json(self, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("hg must not be spawned")


@pytest.fixture
def recording_runner(client: Any) -> Any:
    _RecordingRunner.calls = []
    client.app.dependency_overrides[get_hg_command_runner] = lambda: _RecordingRunner(
        get_settings()
    )
    yield _RecordingRunner
    client.app.dependency_overrides.pop(get_hg_command_runner, None)


def _changeset(client: Any, rev: str) -> Any:
    return client.get(url(ORG, REPO, f"/changesets/{rev}"))


# ---------------------------------------------------------------- revision resolution


def test_short_hash_resolution_and_rejections(client: Any, seeded: dict[str, str]) -> None:
    second = seeded["second"]
    for length in (6, 12, 39):
        response = _changeset(client, second[:length])
        assert response.status_code == 200, (length, response.text)
        assert response.json()["node"] == second

    too_short = _changeset(client, second[:5])
    assert too_short.status_code == 422

    # Decimal revision numbers are never interpreted as revisions.
    for decimal in ("0", "1", "42"):
        assert _changeset(client, decimal).status_code == 422, decimal

    unknown = _changeset(client, "e" * 40)
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "revision_not_found"

    # Pseudo-nodes: working directory (ffff...) and the null revision (0000...), including
    # hex prefixes of the wdir id, must never resolve to a browsable context.
    for pseudo in ("f" * 40, "0" * 40, "ffffff", "f" * 39, "000000"):
        response = _changeset(client, pseudo)
        assert response.status_code == 404, (pseudo, response.status_code)
        browse = client.get(url(ORG, REPO, "/browse"), params={"rev": pseudo})
        assert browse.status_code == 404, (pseudo, browse.status_code)
    unknown_prefix = _changeset(client, "0123456789abcdef0123")
    if unknown_prefix.status_code == 404:
        assert unknown_prefix.json()["error"]["code"] == "revision_not_found"

    for revset in ("tip()", "all()", "--config=x", "-R/", "0:2", "head() and 1"):
        assert _changeset(client, revset).status_code == 422, revset


def test_ambiguous_prefix_is_409_without_candidates(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def ambiguous(self: Any, repo: Any, prefix: str) -> bytes:
        raise RevisionAmbiguousError()

    monkeypatch.setattr(read_service_module.MercurialReadService, "_resolve_prefix", ambiguous)
    response = _changeset(client, seeded["second"][:8])
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "revision_ambiguous"
    for node in seeded.values():
        assert node[:8] not in response.text


def test_ambiguity_only_among_hidden_changesets_resolves_within_served_view(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from mercurial import error as hgerror

    def unfiltered_says_ambiguous(repo: Any, prefix: bytes) -> bytes:
        raise hgerror.AmbiguousPrefixLookupError(prefix, b"changelog", b"ambiguous")

    monkeypatch.setattr(
        read_service_module.scmutil, "resolvehexnodeidprefix", unfiltered_says_ambiguous
    )
    served = _changeset(client, seeded["second"][:10])
    assert served.status_code == 200
    assert served.json()["node"] == seeded["second"]
    # The only "match" is secret: reported as not found, never as ambiguous.
    secret = _changeset(client, seeded["secret"][:10])
    assert secret.status_code == 404
    assert secret.json()["error"]["code"] == "revision_not_found"


def test_secret_changesets_are_hidden_everywhere(client: Any, seeded: dict[str, str]) -> None:
    secret = seeded["secret"]
    assert _changeset(client, secret).status_code == 404
    assert _changeset(client, secret[:12]).status_code == 404
    browse = client.get(url(ORG, REPO, "/browse"), params={"rev": secret})
    assert browse.status_code == 404
    history = client.get(url(ORG, REPO, "/changesets"), params={"limit": 50})
    assert secret not in history.text
    refs = client.get(url(ORG, REPO, "/refs"))
    assert secret not in refs.text
    default_branch = client.get(url(ORG, REPO, "/browse"), params={"rev": "default"})
    assert default_branch.json()["revision"] == seeded["tagged"]
    assert "secret.txt" not in default_branch.text


def test_branch_resolves_to_tip_most_head(client: Any, seeded: dict[str, str]) -> None:
    response = client.get(url(ORG, REPO, "/browse"), params={"rev": "release"})
    assert response.status_code == 200
    assert response.json()["revision"] == seeded["release_b"]
    refs = client.get(url(ORG, REPO, "/refs")).json()
    release = next(ref for ref in refs["branches"] if ref["name"] == "release")
    assert release["node"] == seeded["release_b"]
    assert [ref["name"] for ref in refs["tags"]] == ["v1.0"]


def test_lookup_order_bookmark_then_tag_then_branch(
    client: Any, session_factory: Any, seeded: dict[str, str]
) -> None:
    root = repository_path(session_factory, REPO)
    hg(root, "bookmark", "-f", "-r", seeded["initial"], "release")
    hg(root, "tag", "-l", "-r", seeded["second"], "default")
    by_bookmark = client.get(url(ORG, REPO, "/browse"), params={"rev": "release"})
    assert by_bookmark.json()["revision"] == seeded["initial"]
    by_tag = client.get(url(ORG, REPO, "/browse"), params={"rev": "default"})
    assert by_tag.json()["revision"] == seeded["second"]
    by_tag_name = client.get(url(ORG, REPO, "/browse"), params={"rev": "v1.0"})
    assert by_tag_name.json()["revision"] == seeded["initial"]


def test_legacy_revision_query_param_still_works(client: Any, seeded: dict[str, str]) -> None:
    response = client.get(
        url(ORG, REPO, "/browse"), params={"revision": seeded["initial"], "path": "src/main.cpp"}
    )
    assert response.status_code == 200
    assert "return 0;" in response.json()["content"]


# ---------------------------------------------------------------- browse fields


def test_browse_file_payload_fields(
    client: Any, seeded: dict[str, str], recording_runner: Any
) -> None:
    rev = seeded["tagged"]

    def browse(path: str) -> dict[str, Any]:
        response = client.get(url(ORG, REPO, "/browse"), params={"rev": rev, "path": path})
        assert response.status_code == 200, (path, response.text)
        return dict(response.json())

    cpp = browse("src/main.cpp")
    assert cpp["kind"] == "file"
    assert cpp["content_kind"] == "text"
    assert cpp["language"] == "C++"
    assert cpp["size"] == len("int main() {\n  return 42;\n}\n")
    assert "return 42" in cpp["content"]

    image = browse("assets/logo.png")
    assert (image["content_kind"], image["content"], image["is_binary"]) == ("image", None, True)
    font = browse("fonts/inter.woff2")
    assert (font["content_kind"], font["content"]) == ("font", None)
    binary = browse("bin/blob.bin")
    assert (binary["content_kind"], binary["content"], binary["is_binary"]) == (
        "binary",
        None,
        True,
    )
    latin1 = browse("docs/latin1.txt")
    assert (latin1["content_kind"], latin1["content"]) == ("binary", None)
    link = browse("readme-link")
    assert link["content_kind"] == "symlink"
    assert link["content"] == "README.md"
    unicode_path = browse("docs/naïve résumé.md")
    assert unicode_path["path"] == "docs/naïve résumé.md"
    assert unicode_path["language"] == "Markdown"

    recording_runner.calls.clear()
    big = browse("docs/big.txt")
    assert big["is_too_large"] is True
    assert big["content"] is None
    assert big["size"] == 40_001
    # too_large is decided from the stored size: no `hg cat` was spawned for it.
    assert not any(call and call[0] == "cat" for call in recording_runner.calls)
    # Image/font payloads are not read through hg either.
    assert all(
        call[0] != "cat" or "assets/logo.png" not in call[-1] for call in recording_runner.calls
    )


def test_browse_directory_entries_have_size_and_last_changeset(
    client: Any, seeded: dict[str, str]
) -> None:
    response = client.get(url(ORG, REPO, "/browse"), params={"rev": seeded["tagged"]})
    assert response.status_code == 200
    entries = {entry["name"]: entry for entry in response.json()["entries"]}
    assert entries["src"]["kind"] == "directory"
    assert entries["src"]["size"] is None
    src_last = entries["src"]["last_changeset"]
    assert src_last["node"] == seeded["second"]
    assert src_last["short_node"] == seeded["second"][:12]
    assert src_last["summary"] == "Second change"
    assert src_last["author_name"] == "Bob"
    assert src_last["date"].endswith("Z") or "+00:00" in src_last["date"]
    readme = entries["README.md"]
    assert readme["kind"] == "file"
    assert readme["size"] == len("# Graph\n\nSee [docs](docs/guide.md).\n")
    assert readme["last_changeset"]["node"] == seeded["initial"]
    assert entries[".hgtags"]["last_changeset"]["node"] == seeded["tagged"]


def test_browse_last_changeset_is_null_past_file_cap(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_TREE_LAST_CHANGESET_FILE_CAP", "3")
    get_settings.cache_clear()
    response = client.get(url(ORG, REPO, "/browse"), params={"rev": seeded["tagged"]})
    assert response.status_code == 200
    assert all(entry["last_changeset"] is None for entry in response.json()["entries"])
    small = client.get(url(ORG, REPO, "/browse"), params={"rev": seeded["tagged"], "path": "src"})
    assert small.json()["entries"][0]["last_changeset"]["node"] == seeded["second"]


# ---------------------------------------------------------------- changesets / blame


def test_changesets_limit(client: Any, seeded: dict[str, str]) -> None:
    one = client.get(url(ORG, REPO, "/changesets"), params={"limit": 1})
    assert one.status_code == 200
    assert len(one.json()["changesets"]) == 1
    assert one.json()["changesets"][0]["node"] == seeded["release_b"]
    six = client.get(url(ORG, REPO, "/changesets"), params={"limit": 6})
    assert len(six.json()["changesets"]) == 6
    assert six.json()["next_cursor"] is None
    for bad in (0, 51, -1):
        assert client.get(url(ORG, REPO, "/changesets"), params={"limit": bad}).status_code == 422


def test_blame_adds_date_origin_line_summary_and_flags(client: Any, seeded: dict[str, str]) -> None:
    response = client.get(
        url(ORG, REPO, "/blame"), params={"rev": seeded["tagged"], "path": "src/main.cpp"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_binary"] is False and body["is_too_large"] is False
    first, second = body["lines"][0], body["lines"][1]
    assert first["node"] == seeded["initial"] and first["summary"] == "Initial import"
    assert first["origin_line"] == 1 and first["date"]
    assert second["node"] == seeded["second"] and second["summary"] == "Second change"
    assert second["author_name"] == "Bob" and second["author_email"] == "bob@example.com"
    # Legacy names stay for the frozen React app.
    assert first["revision"] == first["node"] and first["short_revision"] == first["short_node"]

    binary = client.get(url(ORG, REPO, "/blame"), params={"path": "bin/blob.bin"}).json()
    assert binary["is_binary"] is True and binary["lines"] == []
    large = client.get(url(ORG, REPO, "/blame"), params={"path": "docs/big.txt"})
    assert large.status_code == 200
    assert large.json()["is_too_large"] is True and large.json()["lines"] == []


# ---------------------------------------------------------------- raw


def test_raw_header_matrix(client: Any, seeded: dict[str, str]) -> None:
    def raw(path: str) -> Any:
        response = client.get(
            url(ORG, REPO, "/raw"), params={"rev": seeded["tagged"], "path": path}
        )
        assert response.status_code == 200, (path, response.text)
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["content-security-policy"] == "sandbox; default-src 'none'"
        assert response.headers["cross-origin-resource-policy"] == "same-origin"
        assert response.headers["cache-control"] == "private, no-store"
        return response

    for path in ("web/index.html", "web/icon.svg", "data/feed.xml", "assets/fake.png"):
        response = raw(path)
        content_type = response.headers["content-type"]
        assert content_type == "text/plain; charset=utf-8", (path, content_type)
        assert response.headers["content-disposition"].startswith("attachment; ")

    png = raw("assets/logo.png")
    assert png.headers["content-type"] == "image/png"
    assert png.headers["content-disposition"] == "inline; filename*=UTF-8''logo.png"
    assert png.content == _png_bytes()

    blob = raw("bin/blob.bin")
    assert blob.headers["content-type"] == "application/octet-stream"
    assert blob.content == b"\x00\x01\x02REVFORGE\x00"

    unicode_name = raw("docs/naïve résumé.md")
    assert (
        unicode_name.headers["content-disposition"]
        == "attachment; filename*=UTF-8''na%C3%AFve%20r%C3%A9sum%C3%A9.md"
    )

    assert client.get(url(ORG, REPO, "/raw"), params={"path": "src"}).status_code == 404
    assert client.get(url(ORG, REPO, "/raw"), params={"path": "re:.*"}).status_code == 404
    assert client.get(url(ORG, REPO, "/raw"), params={"path": "missing.txt"}).status_code == 404


def test_raw_rejects_injection_without_spawning_hg(client: Any, seeded: dict[str, str]) -> None:
    client.app.dependency_overrides[get_hg_command_runner] = lambda: _ExplodingRunner()
    try:
        for rev in ("--config=extensions.x=!", "-R/", "all()", "tip~1", "default:tip"):
            response = client.get(url(ORG, REPO, "/raw"), params={"rev": rev, "path": "README.md"})
            assert response.status_code == 422, (rev, response.status_code)
        for path in (".hg/hgrc", "../x", "a/../../x", "src\\main.cpp", "a\x00b", "./README.md"):
            response = client.get(url(ORG, REPO, "/raw"), params={"path": path})
            assert response.status_code == 422, (path, response.status_code)
        # A leading slash is stripped to a repository-relative path, never a host path.
        absolute = client.get(url(ORG, REPO, "/raw"), params={"path": "/etc/passwd"})
        assert absolute.status_code == 404
    finally:
        client.app.dependency_overrides.pop(get_hg_command_runner, None)


def test_raw_size_limit_is_checked_before_reading(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_MAX_RAW_BYTES", "1000")
    get_settings.cache_clear()
    client.app.dependency_overrides[get_hg_command_runner] = lambda: _ExplodingRunner()
    try:
        response = client.get(url(ORG, REPO, "/raw"), params={"path": "docs/big.txt"})
    finally:
        client.app.dependency_overrides.pop(get_hg_command_runner, None)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "content_too_large"


def test_copied_large_file_is_never_decompressed_for_size_checks(
    client: Any, seeded: dict[str, str], session_factory: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A copy carries rename metadata, and filelog.size() then reads the whole text.

    A few KB pushed as copies of a huge compressible file must not make browse, stats,
    search, blame or raw decompress it in the API process.
    """
    from mercurial import filelog

    root = repository_path(session_factory, REPO)
    hg(root, "update", "-q", "-r", seeded["tagged"])
    _write(root, "bomb/big.txt", b"\0" * 3_000_000)
    commit(root, "Add a large compressible file")
    hg(root, "copy", "-q", "bomb/big.txt", "bomb/copy.txt")
    node = commit(root, "Copy it")
    monkeypatch.setenv("REVFORGE_MAX_RAW_BYTES", "1000")
    monkeypatch.setenv("REVFORGE_MAX_FILE_CONTENT_BYTES", "1000")
    monkeypatch.setenv("REVFORGE_CODE_SEARCH_MAX_FILE_BYTES", "1000")
    get_settings.cache_clear()
    read_service_module.reset_read_caches()

    largest = {"bytes": 0}
    original = filelog.filelog.read

    def recording_read(self: Any, node_: Any) -> Any:
        data = original(self, node_)
        largest["bytes"] = max(largest["bytes"], len(data))
        return data

    monkeypatch.setattr(filelog.filelog, "read", recording_read)
    browse = client.get(url(ORG, REPO, "/browse"), params={"rev": node, "path": "bomb"})
    assert browse.status_code == 200
    sizes = {entry["name"]: entry["size"] for entry in browse.json()["entries"]}
    # The stored length may include the copy header, never less than the content.
    assert sizes["big.txt"] == 3_000_000
    assert 3_000_000 <= sizes["copy.txt"] < 3_000_200
    assert client.get(url(ORG, REPO, "/stats"), params={"rev": node}).status_code == 200
    assert _search(client, "zz", rev=node).status_code == 200
    file_view = client.get(url(ORG, REPO, "/browse"), params={"rev": node, "path": "bomb/copy.txt"})
    assert file_view.json()["is_too_large"] is True
    blame = client.get(url(ORG, REPO, "/blame"), params={"rev": node, "path": "bomb/copy.txt"})
    assert blame.json()["is_too_large"] is True
    raw = client.get(url(ORG, REPO, "/raw"), params={"rev": node, "path": "bomb/copy.txt"})
    assert raw.status_code == 413
    assert largest["bytes"] < 1_000_000


# ---------------------------------------------------------------- search/code


def _search(client: Any, q: str, **params: Any) -> Any:
    return client.get(url(ORG, REPO, "/search/code"), params={"q": q, **params})


def test_code_search_is_literal_and_case_insensitive(client: Any, seeded: dict[str, str]) -> None:
    flags = _search(client, "--CONFIG=evil")
    assert flags.status_code == 200
    body = flags.json()
    assert body["truncated"] is False
    assert body["items"] == [
        {
            "path": "notes/flags.txt",
            "line": 1,
            "text": "run with --config=evil",
            "ranges": [[9, 22]],
        }
    ]

    started = time.monotonic()
    regex = _search(client, "(a+)+$")
    assert time.monotonic() - started < 5
    assert [item["path"] for item in regex.json()["items"]] == ["notes/flags.txt"]
    assert regex.json()["items"][0]["ranges"] == [[6, 12]]

    # Case folding expands "ß" to "ss": ranges still point into the original text.
    strasse = _search(client, "strasse").json()["items"]
    assert len(strasse) == 1
    text = strasse[0]["text"]
    assert [text[start:end] for start, end in strasse[0]["ranges"]] == ["Straße", "STRASSE"]

    # Binary, symlink and secret content is never searched.
    assert _search(client, "REVFORGE").json()["items"] == []
    assert _search(client, "do not show").json()["items"] == []
    assert _search(client, "return 0", rev=seeded["initial"]).json()["items"][0]["path"] == (
        "src/main.cpp"
    )


def test_code_search_caps_and_validation(
    client: Any, seeded: dict[str, str], session_factory: Any
) -> None:
    root = repository_path(session_factory, REPO)
    hg(root, "update", "-q", "-r", seeded["tagged"])
    _write(root, "many.txt", "".join(f"needle {index} " + "y" * 400 + "\n" for index in range(150)))
    commit(root, "Many matches")
    capped = _search(client, "needle", limit=100).json()
    assert len(capped["items"]) == 100
    assert capped["truncated"] is True
    assert all(len(item["text"]) <= 300 for item in capped["items"])
    limited = _search(client, "needle", limit=5).json()
    assert len(limited["items"]) == 5 and limited["truncated"] is True

    for bad in ("x", "a" * 201, "a" * 256, "ab\ncd", "ab\rcd", "ab\x00cd"):
        response = _search(client, bad)
        assert response.status_code == 422, repr(bad)
    assert _search(client, "needle", limit=101).status_code == 422


def test_code_search_file_and_byte_caps_set_truncated(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_CODE_SEARCH_MAX_FILES", "2")
    get_settings.cache_clear()
    assert _search(client, "STRASSE").json() == {"items": [], "truncated": True}


def test_read_rate_limit_returns_429_with_retry_after(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_READ_RATE_LIMIT_MAX_REQUESTS", "3")
    get_settings.cache_clear()
    for _ in range(3):
        assert _search(client, "main").status_code == 200
    limited = _search(client, "main")
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) >= 1
    # Buckets are per endpoint: raw still has budget.
    assert client.get(url(ORG, REPO, "/raw"), params={"path": "README.md"}).status_code == 200


# ---------------------------------------------------------------- stats


def test_stats_languages_contributors_and_cache(
    client: Any, seeded: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = {"count": 0}
    original = read_service_module.compute_repository_stats

    def counting(*args: Any, **kwargs: Any) -> Any:
        calls["count"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(read_service_module, "compute_repository_stats", counting)
    first = client.get(url(ORG, REPO, "/stats"), params={"rev": seeded["tagged"]})
    assert first.status_code == 200
    body = first.json()
    assert set(body) == {"languages", "contributors", "contributors_truncated", "size_bytes"}
    names = [language["name"] for language in body["languages"]]
    assert "C++" in names and "HTML" in names
    assert all(language["color"].startswith("#") for language in body["languages"])
    assert abs(sum(language["percent"] for language in body["languages"]) - 100) < 1
    assert body["contributors"] == 2  # Alice and Bob; the secret author is not counted
    assert body["contributors_truncated"] is False
    assert body["size_bytes"] > 40_000

    again = client.get(url(ORG, REPO, "/stats"), params={"rev": seeded["tagged"][:12]})
    assert again.json() == body
    assert calls["count"] == 1


# ---------------------------------------------------------------- authorization matrix

_READ_ENDPOINTS = (
    ("/browse", {}),
    ("/blame", {"path": "README.md"}),
    ("/raw", {"path": "README.md"}),
    ("/search/code", {"q": "graph"}),
    ("/stats", {}),
    ("/changesets", {}),
)


def _statuses(client: Any, repo: str) -> dict[str, int]:
    return {
        suffix: client.get(url(ORG, repo, suffix), params=params).status_code
        for suffix, params in _READ_ENDPOINTS
    }


def test_read_authorization_matrix(client: Any, session_factory: Any) -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "secret-repo", "private")
    assert provision(client, ORG, "secret-repo").status_code == 200
    root = repository_path(session_factory, "secret-repo")
    _write(root, "README.md", "# graph\n")
    commit(root, "Initial import")
    create_repo(client, ORG, "pending", "public")
    create_repo(client, ORG, "broken", "public")
    update_repository(session_factory, "broken", provisioning_state="failed")
    register(client, "reader@example.com")
    register(client, "outsider@example.com")
    register(client, "inactive@example.com")
    login(client, OWNER)
    add_member(client, ORG, "reader@example.com")
    add_member(client, ORG, "inactive@example.com")
    grant(client, ORG, "secret-repo", "reader@example.com", "read")
    grant(client, ORG, "secret-repo", "inactive@example.com", "read")
    login(client, "outsider@example.com")
    create_org(client, "other")

    def every(expected: int, repo: str = "secret-repo") -> None:
        statuses = _statuses(client, repo)
        assert set(statuses.values()) == {expected}, statuses

    client.app.dependency_overrides[get_hg_command_runner] = lambda: _ExplodingRunner()
    client.app.dependency_overrides[get_mercurial_read_service] = lambda: _ExplodingRunner()
    try:
        client.cookies.clear()
        every(404)  # anonymous on private
        login(client, "outsider@example.com")
        every(404)  # signed in, other organization only
        login(client, "inactive@example.com")
        deactivate_user(session_factory, "inactive@example.com")
        every(404)  # inactive session = anonymous
        every(409, "pending")  # unprovisioned
        every(409, "broken")  # failed provisioning
        not_ready = client.get(url(ORG, "pending", "/raw"), params={"path": "README.md"})
        assert not_ready.json()["error"]["code"] == "repository_not_ready"
    finally:
        client.app.dependency_overrides.pop(get_hg_command_runner, None)
        client.app.dependency_overrides.pop(get_mercurial_read_service, None)

    login(client, "reader@example.com")
    every(200)
    login(client, OWNER)
    archive = client.patch(url(ORG, "secret-repo"), json={"archived": True}, headers=csrf(client))
    assert archive.status_code == 200
    login(client, "reader@example.com")
    every(200)  # archived repositories stay readable


# ---------------------------------------------------------------- GET R / transport


def test_repository_detail_exposes_provisioning_fields(client: Any, session_factory: Any) -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "repo", "public")
    update_repository(
        session_factory,
        "repo",
        provisioning_state="failed",
        provisioning_error_code="hg_command_failed",
    )
    detail = client.get(url(ORG, "repo")).json()
    assert detail["provisioning_error"] == "hg_init_failed"  # legacy code coarsened
    assert detail["provisioning_started_at"] is None
    update_repository(session_factory, "repo", provisioning_error_code="/srv/secret/path: boom")
    detail = client.get(url(ORG, "repo")).json()
    assert detail["provisioning_error"] == "storage_error"
    assert "/srv/secret" not in str(detail)
    update_repository(session_factory, "repo", provisioning_state="ready")
    assert client.get(url(ORG, "repo")).json()["provisioning_error"] is None


def test_provisioning_details_are_only_shown_to_managers(client: Any, session_factory: Any) -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "repo", "public")
    update_repository(
        session_factory,
        "repo",
        provisioning_state="failed",
        provisioning_error_code="storage_conflict",
    )
    assert client.get(url(ORG, "repo")).json()["provisioning_error"] == "storage_conflict"
    reader = "reader@example.com"
    register(client, reader)
    login(client, OWNER)
    add_member(client, ORG, reader)
    grant(client, ORG, "repo", reader, "read")
    login(client, reader)
    detail = client.get(url(ORG, "repo")).json()
    assert detail["provisioning_state"] == "failed"
    assert detail["provisioning_error"] is None
    assert detail["provisioning_started_at"] is None
    client.cookies.clear()
    anonymous = client.get(url(ORG, "repo")).json()
    assert anonymous["provisioning_state"] == "failed"
    assert anonymous["provisioning_error"] is None


def test_transport_anonymous_public_https_only_and_path_hint_for_admins(
    client: Any, session_factory: Any
) -> None:
    register(client, OWNER)
    create_org(client, ORG)
    create_repo(client, ORG, "open", "public")
    create_repo(client, ORG, "closed", "private")
    register(client, "reader@example.com")
    login(client, OWNER)
    add_member(client, ORG, "reader@example.com")

    admin_view = client.get(url(ORG, "open", "/transport")).json()
    assert admin_view["ssh"]["authorized_keys_path_hint"]

    login(client, "reader@example.com")
    member_view = client.get(url(ORG, "open", "/transport")).json()
    assert member_view["ssh"]["authorized_keys_path_hint"] is None
    assert member_view["https"]["username_hint"] == "reader@example.com"

    client.cookies.clear()
    anonymous = client.get(url(ORG, "open", "/transport"))
    assert anonymous.status_code == 200
    body = anonymous.json()
    assert body["ssh"] is None
    assert body["https"]["clone_url"].endswith("/acme/open")
    assert body["https"]["username_hint"] is None
    assert body["repository"]["can_write"] is False
    assert body["setup"]["recommended_next_step"] == "sign_in"
    assert "authorized_keys" not in anonymous.text
    assert client.get(url(ORG, "closed", "/transport")).status_code == 404


@pytest.mark.asyncio
async def test_cancelled_read_keeps_its_work_slot_until_the_thread_finishes(
    tmp_path: Path,
) -> None:
    import asyncio
    import threading

    settings = get_settings()
    service = read_service_module.MercurialReadService(
        settings=settings, command_runner=HgCommandRunner(settings)
    )
    release = threading.Event()
    started = threading.Event()

    def blocking() -> str:
        started.set()
        release.wait(5)
        return "done"

    task = asyncio.create_task(service._in_thread(tmp_path, blocking))
    assert await asyncio.to_thread(started.wait, 5)
    task.cancel()
    await asyncio.sleep(0.05)
    # Still holding the slot while the thread runs, even though the caller was cancelled.
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
