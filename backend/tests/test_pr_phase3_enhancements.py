"""Tests for Phase 3 pull-request endpoint enhancements.

Covers: enhanced list with counts/cursor/search/author, comment resolution,
viewed files, timeline, merge-status, compare, and /me/pull-requests.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from repo_fixtures import commit, hg, repository_path

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}
PASSWORD = "StrongPassword123"

_FACTORY: dict[str, object] = {}


@pytest.fixture(autouse=True)
def _capture_session_factory(session_factory) -> None:
    _FACTORY["factory"] = session_factory


def _provision_and_seed(client, organization_slug: str, slug: str) -> None:
    response = client.post(
        f"/api/v1/organizations/{organization_slug}/repositories/{slug}/provision",
        headers=_csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    root = repository_path(_FACTORY["factory"], slug)  # type: ignore[arg-type]
    (root / "README.md").write_text("seed\n", encoding="utf-8")
    commit(root, "Seed")
    hg(root, "branch", "-q", "topic")
    (root / "topic.txt").write_text("topic\n", encoding="utf-8")
    commit(root, "Topic work")


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _pr_base(organization_slug: str, repository_slug: str) -> str:
    return f"/api/v1/organizations/{organization_slug}/repositories/{repository_slug}/pull-requests"


def _register(client, email: str) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": email.split("@")[0],
            "password": PASSWORD,
        },
    )
    assert response.status_code == 201
    return str(response.json()["user"]["id"])


def _login(client, email: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200


def _create_organization(client, slug: str) -> None:
    response = client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 201


def _create_repository(client, organization_slug: str, slug: str) -> None:
    response = client.post(
        f"/api/v1/organizations/{organization_slug}/repositories",
        json={
            "slug": slug,
            "display_name": slug.title(),
            "description": None,
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    assert response.status_code == 201


def _add_org_member(client, organization_slug: str, user_id: str, role: str = "member") -> None:
    response = client.post(
        f"/api/v1/organizations/{organization_slug}/members",
        json={"user_id": user_id, "role": role},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 201


def _add_repo_permission(
    client,
    organization_slug: str,
    repository_slug: str,
    user_id: str,
    role: str = "write",
) -> None:
    response = client.post(
        f"/api/v1/organizations/{organization_slug}/repositories/{repository_slug}/permissions",
        json={"user_id": user_id, "role": role},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 201


def _get_revisions(client, organization_slug: str, repository_slug: str):
    resp = client.get(
        f"/api/v1/organizations/{organization_slug}/repositories/{repository_slug}/changesets"
    )
    assert resp.status_code == 200
    changesets = resp.json()["changesets"]
    # First changeset is the topic one (latest), second is the seed
    topic_node = changesets[0]["node"]
    seed_node = changesets[1]["node"]
    return topic_node, seed_node


def _setup_org_and_repo(client, org_slug: str = "testorg", repo_slug: str = "testrepo"):
    """Register user, create org, create repo, provision and seed."""
    _register(client, "owner@test.com")
    _login(client, "owner@test.com")
    _create_organization(client, org_slug)
    _create_repository(client, org_slug, repo_slug)
    _provision_and_seed(client, org_slug, repo_slug)
    return org_slug, repo_slug


def _create_pr(client, org_slug: str, repo_slug: str, title: str = "Test PR"):
    topic_node, seed_node = _get_revisions(client, org_slug, repo_slug)
    base = _pr_base(org_slug, repo_slug)
    resp = client.post(
        base,
        json={
            "title": title,
            "description": "A test pull request",
            "source_revision": topic_node,
            "target_revision": seed_node,
            "source_branch": "topic",
            "target_branch": "default",
        },
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Test: enhanced list endpoint returns counts, cursor, and supports search
# ---------------------------------------------------------------------------


def test_list_pull_requests_returns_counts(client) -> None:
    org, repo = _setup_org_and_repo(client)
    _create_pr(client, org, repo, title="First PR")

    base = _pr_base(org, repo)
    resp = client.get(base)
    assert resp.status_code == 200
    data = resp.json()

    assert "pull_requests" in data
    assert "counts" in data
    assert "next_cursor" in data

    counts = data["counts"]
    assert counts["open"] == 1
    assert counts["draft"] == 0
    assert counts["merged"] == 0
    assert counts["closed"] == 0

    assert len(data["pull_requests"]) == 1


def test_list_pull_requests_search_by_title(client) -> None:
    org, repo = _setup_org_and_repo(client)
    _create_pr(client, org, repo, title="Unique search title")

    base = _pr_base(org, repo)

    # Search that matches
    resp = client.get(base, params={"q": "Unique"})
    assert resp.status_code == 200
    assert len(resp.json()["pull_requests"]) == 1

    # Search that doesn't match
    resp = client.get(base, params={"q": "nonexistent"})
    assert resp.status_code == 200
    assert len(resp.json()["pull_requests"]) == 0


def test_list_pull_requests_filter_by_author(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)

    base = _pr_base(org, repo)
    author_id = pr_data["author_id"]

    # Filter by actual author
    resp = client.get(base, params={"author": author_id})
    assert resp.status_code == 200
    assert len(resp.json()["pull_requests"]) == 1

    # Filter by nonexistent author
    resp = client.get(base, params={"author": str(uuid4())})
    assert resp.status_code == 200
    assert len(resp.json()["pull_requests"]) == 0


def test_list_pull_requests_filter_by_state(client) -> None:
    org, repo = _setup_org_and_repo(client)
    _create_pr(client, org, repo)

    base = _pr_base(org, repo)

    resp = client.get(base, params={"state": "open"})
    assert resp.status_code == 200
    assert len(resp.json()["pull_requests"]) == 1

    resp = client.get(base, params={"state": "closed"})
    assert resp.status_code == 200
    assert len(resp.json()["pull_requests"]) == 0


# ---------------------------------------------------------------------------
# Test: comment resolve
# ---------------------------------------------------------------------------


def test_resolve_comment(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    # Add a comment
    comment_resp = client.post(
        f"{base}/{pr_id}/comments",
        json={"body": "This needs fixing"},
        headers=_csrf_headers(client),
    )
    assert comment_resp.status_code == 201
    comment_id = comment_resp.json()["id"]
    assert comment_resp.json()["resolved"] is False

    # Resolve the comment
    resolve_resp = client.post(
        f"{base}/{pr_id}/comments/{comment_id}/resolve",
        json={"resolved": True},
        headers=_csrf_headers(client),
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["resolved"] is True

    # Unresolve the comment
    unresolve_resp = client.post(
        f"{base}/{pr_id}/comments/{comment_id}/resolve",
        json={"resolved": False},
        headers=_csrf_headers(client),
    )
    assert unresolve_resp.status_code == 200
    assert unresolve_resp.json()["resolved"] is False


def test_resolve_nonexistent_comment_returns_404(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    resp = client.post(
        f"{base}/{pr_id}/comments/{uuid4()}/resolve",
        json={"resolved": True},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test: viewed files
# ---------------------------------------------------------------------------


def test_set_viewed_file(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    # Mark a file as viewed
    resp = client.put(
        f"{base}/{pr_id}/viewed",
        json={"path": "topic.txt", "viewed": True},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json() == {"path": "topic.txt", "viewed": True}

    # Mark the same file as not viewed
    resp = client.put(
        f"{base}/{pr_id}/viewed",
        json={"path": "topic.txt", "viewed": False},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json() == {"path": "topic.txt", "viewed": False}


def test_viewed_file_on_nonexistent_pr_returns_404(client) -> None:
    org, repo = _setup_org_and_repo(client)
    base = _pr_base(org, repo)

    resp = client.put(
        f"{base}/{uuid4()}/viewed",
        json={"path": "topic.txt", "viewed": True},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test: timeline
# ---------------------------------------------------------------------------


def test_timeline_has_opened_event(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    resp = client.get(f"{base}/{pr_id}/timeline")
    assert resp.status_code == 200
    data = resp.json()

    assert "items" in data
    assert len(data["items"]) >= 1

    # First event should be "opened"
    opened_events = [e for e in data["items"] if e["type"] == "opened"]
    assert len(opened_events) == 1
    assert opened_events[0]["actor"]["id"] == pr_data["author_id"]


def test_timeline_includes_comments(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    # Add a comment
    client.post(
        f"{base}/{pr_id}/comments",
        json={"body": "A comment"},
        headers=_csrf_headers(client),
    )

    resp = client.get(f"{base}/{pr_id}/timeline")
    assert resp.status_code == 200
    data = resp.json()

    comment_events = [e for e in data["items"] if e["type"] == "comment"]
    assert len(comment_events) == 1


def test_timeline_nonexistent_pr_returns_404(client) -> None:
    org, repo = _setup_org_and_repo(client)
    base = _pr_base(org, repo)

    resp = client.get(f"{base}/{uuid4()}/timeline")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test: merge-status
# ---------------------------------------------------------------------------


def test_merge_status_open_pr_without_reviews(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    resp = client.get(f"{base}/{pr_id}/merge-status")
    assert resp.status_code == 200
    data = resp.json()

    assert "mergeable" in data
    assert "checks" in data
    assert isinstance(data["checks"], list)

    # Should have checks
    check_ids = [c["id"] for c in data["checks"]]
    assert "not_draft" in check_ids
    assert "no_changes_requested" in check_ids
    assert "required_reviewers" in check_ids
    assert "min_approvals" in check_ids

    # not_draft should be ok (it's OPEN not DRAFT)
    not_draft = next(c for c in data["checks"] if c["id"] == "not_draft")
    assert not_draft["ok"] is True

    # min_approvals should fail (no reviews)
    min_approvals = next(c for c in data["checks"] if c["id"] == "min_approvals")
    assert min_approvals["ok"] is False


def test_merge_status_nonexistent_pr_returns_404(client) -> None:
    org, repo = _setup_org_and_repo(client)
    base = _pr_base(org, repo)

    resp = client.get(f"{base}/{uuid4()}/merge-status")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test: compare
# ---------------------------------------------------------------------------


def test_compare_endpoint(client) -> None:
    org, repo = _setup_org_and_repo(client)
    topic_node, seed_node = _get_revisions(client, org, repo)

    compare_url = f"/api/v1/organizations/{org}/repositories/{repo}/compare"
    resp = client.get(
        compare_url,
        params={"base": seed_node, "head": topic_node},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "base_node" in data
    assert "head_node" in data
    assert "merge_base" in data
    assert "files" in data
    assert "conflicts" in data
    assert "identical" in data
    assert data["identical"] is False


def test_compare_identical_revisions(client) -> None:
    org, repo = _setup_org_and_repo(client)
    topic_node, _seed_node = _get_revisions(client, org, repo)

    compare_url = f"/api/v1/organizations/{org}/repositories/{repo}/compare"
    resp = client.get(
        compare_url,
        params={"base": topic_node, "head": topic_node},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["identical"] is True


# ---------------------------------------------------------------------------
# Test: /me/pull-requests
# ---------------------------------------------------------------------------


def test_me_pull_requests_authored(client) -> None:
    org, repo = _setup_org_and_repo(client)
    _create_pr(client, org, repo)

    resp = client.get("/api/v1/me/pull-requests", params={"filter": "authored"})
    assert resp.status_code == 200
    data = resp.json()
    assert "pull_requests" in data
    assert len(data["pull_requests"]) == 1

    pr = data["pull_requests"][0]
    assert "repository" in pr
    assert pr["repository"]["org"] == org
    assert pr["repository"]["repo"] == repo


def test_me_pull_requests_unauthenticated(client) -> None:
    # Log out by clearing cookies
    client.cookies.clear()
    resp = client.get("/api/v1/me/pull-requests")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test: anonymous cannot access write-only endpoints
# ---------------------------------------------------------------------------


def test_anonymous_cannot_resolve_comment(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    # Add a comment first
    comment_resp = client.post(
        f"{base}/{pr_id}/comments",
        json={"body": "Comment"},
        headers=_csrf_headers(client),
    )
    assert comment_resp.status_code == 201
    comment_id = comment_resp.json()["id"]

    # Clear cookies (log out)
    client.cookies.clear()

    resp = client.post(
        f"{base}/{pr_id}/comments/{comment_id}/resolve",
        json={"resolved": True},
        headers=ORIGIN_HEADERS,
    )
    # Should fail -- either 401 or 403
    assert resp.status_code in (401, 403)


def test_anonymous_cannot_set_viewed_file(client) -> None:
    org, repo = _setup_org_and_repo(client)
    pr_data = _create_pr(client, org, repo)
    pr_id = pr_data["id"]
    base = _pr_base(org, repo)

    # Clear cookies (log out)
    client.cookies.clear()

    resp = client.put(
        f"{base}/{pr_id}/viewed",
        json={"path": "topic.txt", "viewed": True},
        headers=ORIGIN_HEADERS,
    )
    assert resp.status_code in (401, 403)
