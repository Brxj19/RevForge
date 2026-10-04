from __future__ import annotations

from uuid import uuid4

import pytest

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}
PASSWORD = "StrongPassword123"
PR_BASE = "/api/v1/organizations/review/repositories/project/pull-requests"


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _pr_base(organization_slug: str, repository_slug: str) -> str:
    return f"/api/v1/organizations/{organization_slug}/repositories/{repository_slug}/pull-requests"


def _register(client, email: str) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": email.split("@")[0], "password": PASSWORD},
    )
    assert response.status_code == 201
    return str(response.json()["user"]["id"])


def _login(client, email: str) -> None:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
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


def _create_owner_repository(client) -> None:
    _register(client, "owner@example.com")
    _create_organization(client, "review")
    _create_repository(client, "review", "project")


def _create_pull_request(client, base: str = PR_BASE) -> str:
    response = client.post(
        base,
        json={"title": "Add feature", "source_revision": "abc123", "target_revision": "def456"},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 201
    assert response.json()["state"] == "open"
    return str(response.json()["id"])


def test_close_pull_request_marks_it_closed(client) -> None:
    _create_owner_repository(client)
    pull_request_id = _create_pull_request(client)

    close = client.post(f"{PR_BASE}/{pull_request_id}/close", headers=_csrf_headers(client))

    assert close.status_code == 200
    assert close.json()["state"] == "closed"
    assert close.json()["closed_at"] is not None

    close_again = client.post(f"{PR_BASE}/{pull_request_id}/close", headers=_csrf_headers(client))
    assert close_again.status_code == 409


def _cross_repository_requests(base: str, pull_request_id: str, reviewer_id: str):
    target = f"{base}/{pull_request_id}"
    return [
        ("get", target, None),
        ("patch", target, {"title": "Hijacked"}),
        ("post", f"{target}/close", None),
        ("post", f"{target}/merge", None),
        ("get", f"{target}/diff", None),
        ("post", f"{target}/comments", {"body": "Injected comment"}),
        ("post", f"{target}/reviews", {"decision": "approved"}),
        ("post", f"{target}/reviewers", {"reviewer_id": reviewer_id}),
        ("delete", f"{target}/reviewers/{reviewer_id}", None),
    ]


@pytest.fixture
def victim_pull_request(client) -> dict[str, str]:
    """Owner B: private repo review/project with an open PR (one reviewer), plus review/other.

    Owner A: admin of alpha/app in a different organization, no access to review/*.
    Leaves the client logged in as Owner A.
    """
    owner_b_id = _register(client, "owner-b@example.com")
    _create_organization(client, "review")
    _create_repository(client, "review", "project")
    _create_repository(client, "review", "other")
    pull_request_id = _create_pull_request(client, _pr_base("review", "project"))
    # Seed a reviewer so an unscoped remove-reviewer would have something to delete.
    reviewer = client.post(
        f"{_pr_base('review', 'project')}/{pull_request_id}/reviewers",
        json={"reviewer_id": owner_b_id},
        headers=_csrf_headers(client),
    )
    assert reviewer.status_code == 201

    owner_a_id = _register(client, "owner-a@example.com")
    _create_organization(client, "alpha")
    _create_repository(client, "alpha", "app")
    return {
        "pull_request_id": pull_request_id,
        "owner_a_id": owner_a_id,
        "owner_b_id": owner_b_id,
    }


def _assert_victim_pull_request_untouched(client, pull_request_id: str, owner_b_id: str) -> None:
    _login(client, "owner-b@example.com")
    detail = client.get(f"{_pr_base('review', 'project')}/{pull_request_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["state"] == "open"
    assert body["title"] == "Add feature"
    assert body["comments"] == []
    assert body["reviews"] == []
    assert [reviewer["reviewer_id"] for reviewer in body["reviewers"]] == [owner_b_id]


def _error_without_request_id(response) -> tuple[int, dict[str, object]]:
    error = dict(response.json()["error"])
    error.pop("request_id", None)
    return response.status_code, error


def _assert_indistinguishable_from_missing_pull_request(
    client, base: str, pull_request_id: str, reviewer_id: str
) -> None:
    foreign = _cross_repository_requests(base, pull_request_id, reviewer_id)
    missing = _cross_repository_requests(base, str(uuid4()), reviewer_id)
    for (method, url, payload), (_, missing_url, _) in zip(foreign, missing, strict=True):
        response = client.request(method, url, json=payload, headers=_csrf_headers(client))
        assert response.status_code == 404, (method, url, response.status_code, response.text)
        assert response.json()["error"]["message"] == "Pull request not found.", (method, url)
        baseline = client.request(method, missing_url, json=payload, headers=_csrf_headers(client))
        assert _error_without_request_id(baseline) == _error_without_request_id(response), method


def test_pull_request_from_another_organization_is_not_reachable(
    client, victim_pull_request
) -> None:
    pull_request_id = victim_pull_request["pull_request_id"]
    owner_b_id = victim_pull_request["owner_b_id"]

    _assert_indistinguishable_from_missing_pull_request(
        client, _pr_base("alpha", "app"), pull_request_id, owner_b_id
    )

    _assert_victim_pull_request_untouched(client, pull_request_id, owner_b_id)


def test_pull_request_from_another_repository_in_same_organization_is_not_reachable(
    client, victim_pull_request
) -> None:
    pull_request_id = victim_pull_request["pull_request_id"]
    owner_b_id = victim_pull_request["owner_b_id"]
    _login(client, "owner-b@example.com")

    _assert_indistinguishable_from_missing_pull_request(
        client, _pr_base("review", "other"), pull_request_id, owner_b_id
    )

    _assert_victim_pull_request_untouched(client, pull_request_id, owner_b_id)


def test_pull_request_is_still_reachable_through_its_own_repository(
    client, victim_pull_request
) -> None:
    pull_request_id = victim_pull_request["pull_request_id"]
    _login(client, "owner-b@example.com")
    base = _pr_base("review", "project")

    detail = client.get(f"{base}/{pull_request_id}")
    assert detail.status_code == 200
    assert detail.json()["id"] == pull_request_id

    comment = client.post(
        f"{base}/{pull_request_id}/comments",
        json={"body": "Looks good"},
        headers=_csrf_headers(client),
    )
    assert comment.status_code == 201
    assert comment.json()["pull_request_id"] == pull_request_id


def _add_member(client, org: str, email: str, role: str = "member") -> None:
    r = client.post(
        f"/api/v1/organizations/{org}/members",
        json={"user": email, "role": role},
        headers=_csrf_headers(client),
    )
    assert r.status_code == 201, r.text


def _grant_repo_permission(client, org: str, repo: str, email: str, role: str) -> None:
    r = client.put(
        f"/api/v1/organizations/{org}/repositories/{repo}/permissions",
        json={"user": email, "role": role},
        headers=_csrf_headers(client),
    )
    assert r.status_code in (200, 201), r.text


def test_write_role_user_can_create_pull_request(client) -> None:
    # C6: a user with explicit WRITE (not org admin) must be able to open a PR.
    _register(client, "owner@example.com")
    _create_organization(client, "review")
    _create_repository(client, "review", "project")
    _register(client, "writer@example.com")  # leaves client logged in as writer
    _login(client, "owner@example.com")
    _add_member(client, "review", "writer@example.com", role="member")
    _grant_repo_permission(client, "review", "project", "writer@example.com", role="write")

    _login(client, "writer@example.com")
    created = client.post(
        _pr_base("review", "project"),
        json={"title": "From writer", "source_revision": "abc123", "target_revision": "def456"},
        headers=_csrf_headers(client),
    )
    assert created.status_code == 201, created.text


def test_anonymous_can_read_public_repo_pull_request(client) -> None:
    # C7: anonymous users can view PRs on a public repository.
    _register(client, "owner@example.com")
    _create_organization(client, "review")
    client.post(
        "/api/v1/organizations/review/repositories",
        json={
            "slug": "project",
            "display_name": "Project",
            "description": None,
            "visibility": "public",
        },
        headers=_csrf_headers(client),
    )
    pull_request_id = _create_pull_request(client, _pr_base("review", "project"))

    client.cookies.clear()  # become anonymous
    detail = client.get(f"{_pr_base('review', 'project')}/{pull_request_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["id"] == pull_request_id


def test_close_sets_real_timestamp(client) -> None:
    # C5: closed_at is a concrete timestamp, not an unresolved SQL expression.
    from datetime import datetime

    _create_owner_repository(client)
    pull_request_id = _create_pull_request(client)
    closed = client.post(f"{PR_BASE}/{pull_request_id}/close", headers=_csrf_headers(client))
    assert closed.status_code == 200
    # Parses as an ISO timestamp (would be missing/garbled if func.now() didn't resolve).
    datetime.fromisoformat(closed.json()["closed_at"])


def test_read_only_user_cannot_create_pull_request(client) -> None:
    # C6 negative: explicit READ role must not reach a write route.
    _register(client, "owner@example.com")
    _create_organization(client, "review")
    _create_repository(client, "review", "project")
    _register(client, "reader@example.com")
    _login(client, "owner@example.com")
    _add_member(client, "review", "reader@example.com", role="member")
    _grant_repo_permission(client, "review", "project", "reader@example.com", role="read")

    _login(client, "reader@example.com")
    denied = client.post(
        _pr_base("review", "project"),
        json={"title": "nope", "source_revision": "abc123", "target_revision": "def456"},
        headers=_csrf_headers(client),
    )
    assert denied.status_code == 403, denied.text


def test_anonymous_cannot_read_private_repo_pull_request(client) -> None:
    # C7 negative: anon must get 404 (not 200/403) on a private repo PR.
    _create_owner_repository(client)  # private repo review/project
    pull_request_id = _create_pull_request(client)
    client.cookies.clear()
    resp = client.get(f"{PR_BASE}/{pull_request_id}")
    assert resp.status_code == 404, resp.text
