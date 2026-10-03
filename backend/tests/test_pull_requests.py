from __future__ import annotations

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}
PR_BASE = "/api/v1/organizations/review/repositories/project/pull-requests"


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _create_owner_repository(client) -> None:
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "display_name": "Owner User",
            "password": "StrongPassword123",
        },
    )
    assert register.status_code == 201
    organization = client.post(
        "/api/v1/organizations",
        json={"slug": "review", "display_name": "Review Org", "description": None},
        headers=_csrf_headers(client),
    )
    assert organization.status_code == 201
    repository = client.post(
        "/api/v1/organizations/review/repositories",
        json={
            "slug": "project",
            "display_name": "Project",
            "description": None,
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    assert repository.status_code == 201


def _create_pull_request(client) -> str:
    response = client.post(
        PR_BASE,
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
