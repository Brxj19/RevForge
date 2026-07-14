from __future__ import annotations

from dataclasses import dataclass


SENSITIVE_KEYS = {
    "credential_id",
    "fingerprint_sha256",
    "key_id",
    "repository_path",
    "session_id",
    "source_ip",
    "token_id",
    "user_id",
}

SAFE_LABELS = {
    "authentication_method": "Authentication",
    "can_write": "Write access",
    "capability": "Capability",
    "command_kind": "Command",
    "expires_at": "Expires",
    "key_label": "Key label",
    "member_user_display_name": "Member",
    "member_user_email": "Member email",
    "new_slug": "New slug",
    "organization_slug": "Organization",
    "previous_slug": "Previous slug",
    "pushed_node_count": "Changesets received",
    "repository_slug": "Repository",
    "role": "Role",
    "status": "Status",
    "token_scope": "Token scope",
    "user_display_name": "User",
    "user_email": "User email",
    "visibility": "Visibility",
}

YES_NO_KEYS = {"can_write"}
EVENT_TITLES = {
    "organization.created": "Organization created",
    "organization.member_added": "Organization member added",
    "organization.member_removed": "Organization member removed",
    "organization.member_role_changed": "Organization member role changed",
    "organization.updated": "Organization updated",
    "repository.archived": "Repository archived",
    "repository.created": "Repository created",
    "repository.deleted": "Repository deleted",
    "repository.permission_changed": "Repository permission changed",
    "repository.permission_granted": "Repository permission granted",
    "repository.permission_revoked": "Repository permission revoked",
    "repository.push.accepted": "Push accepted",
    "repository.slug_renamed": "Repository slug renamed",
    "repository.unarchived": "Repository unarchived",
    "repository.updated": "Repository updated",
    "ssh_key.added": "SSH key added",
    "ssh_key.removed": "SSH key removed",
    "token.created": "Access token created",
    "token.revoked": "Access token revoked",
    "transport.hg_http.authorized": "Mercurial HTTP access authorized",
    "transport.hg_http.completed": "Mercurial HTTP request completed",
    "transport.personal_access_token.used": "Access token used",
    "transport.ssh_public_key.used": "SSH key used",
    "transport.hg_ssh.authorized": "Mercurial SSH access authorized",
    "user.logged_in": "User logged in",
    "user.logged_out": "User logged out",
    "user.registered": "User registered",
    "user.session.revoked": "Session revoked",
}


@dataclass(slots=True)
class ActivityDetail:
    label: str
    value: str


@dataclass(slots=True)
class PresentedActivity:
    summary: str
    details: list[ActivityDetail]


def _format_label(key: str) -> str:
    label = SAFE_LABELS.get(key)
    if label is not None:
        return label
    return key.replace("_", " ").strip().capitalize()


def _format_value(key: str, value: object) -> str | None:
    if value is None:
        return None
    if key in YES_NO_KEYS and isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        if key == "pushed_nodes":
            return str(len(value))
        if all(isinstance(item, str) for item in value):
            return ", ".join(value)
        return str(len(value))
    return None


def _sanitize_mapping(data: dict[str, object] | None) -> list[ActivityDetail]:
    if not data:
        return []

    details: list[ActivityDetail] = []
    for key, value in data.items():
        if key in SENSITIVE_KEYS:
            continue
        if key == "pushed_nodes":
            details.append(ActivityDetail(label="Changesets received", value=str(len(value))))
            continue
        rendered = _format_value(key, value)
        if rendered is None or rendered == "":
            continue
        details.append(ActivityDetail(label=_format_label(key), value=rendered))
    return details


def _build_summary(event_type: str, details: list[ActivityDetail]) -> str:
    base = EVENT_TITLES.get(event_type, event_type.replace(".", " "))
    if event_type == "repository.push.accepted":
        pushed = next((detail.value for detail in details if detail.label == "Changesets received"), None)
        auth = next((detail.value for detail in details if detail.label == "Authentication"), None)
        if pushed and auth:
            return f"{base}: {pushed} changeset{'s' if pushed != '1' else ''} over {auth}"
        if pushed:
            return f"{base}: {pushed} changeset{'s' if pushed != '1' else ''}"
    return base


def present_activity(event_type: str, data: dict[str, object] | None) -> PresentedActivity:
    details = _sanitize_mapping(data)
    return PresentedActivity(summary=_build_summary(event_type, details), details=details)
