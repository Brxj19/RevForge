# ADR 0008: Platform Admin Role, Break-Glass Access, and User Suspension

## Status

Accepted (2026-11)

## Context

RevForge separates repository/organization permissions (`read`, `write`, `admin`, `owner`) from global platform administration (`platform_admin`). Previously, no `platform_admin` flag, user suspension workflow, break-glass incident access, or audit severity tier existed in the backend (audit item I28). Without these controls:

- Operators could not suspend compromised accounts or revoke active sessions across browser sessions, PATs, and SSH keys.
- Operators had no controlled, audited path to inspect a private repository during an incident.
- Platform administration and organization administration risked collapsing into a single implicit superuser flag that grants silent access to private source code.

## Decision

### 1. Explicit `platform_admin` separation (zero implicit code access)

- Add `users.is_platform_admin` (`BOOLEAN NOT NULL DEFAULT FALSE`), readable in `UserSummary` and never writable via self-registration or profile-update endpoints.
- Enforce platform-admin authorization in both FastAPI dependencies (`require_platform_admin`, `require_platform_admin_csrf`) and the domain policy layer (`services/authorization.require_platform_admin`). Every admin and break-glass service entrypoint checks `require_platform_admin(actor)`.
- `is_platform_admin` **never** grants implicit repository access in `repository_access_for_actor`, search, Mercurial HTTP transport, or Mercurial SSH transport.

### 2. Single-repository, read-only, time-bounded break-glass sessions

- Store break-glass sessions in `break_glass_sessions` scoped to a single `(actor_user_id, organization_id, repository_id)` tuple with server-computed `expires_at` (`duration_minutes` strictly in `{15, 60, 240}`) and a validated reason (`10..500` characters, no control characters).
- Enforce at most one active break-glass session per platform admin (`409 Conflict` if one is already active).
- Starting a break-glass session emits a `severity="high"` `admin.break_glass.started` audit event (visible in the organization's audit log) and creates in-app notifications for all active organization `OWNER` members.
- During an active, unrevoked, unexpired session, `get_repository_access_for_actor` grants **read-only** access (`can_read=True`, `can_write=False`, `can_manage=False`) to that repository only, emits a `severity="high"` `admin.break_glass.used` audit event, and explicitly commits the transaction so `GET` routes never drop audit records.
- Break-glass is strictly excluded from Mercurial HTTP/SSH gateways, global search, and PR review/merge eligibility (`allow_break_glass=False`).
- Revoking a session sets `revoked_at` and emits `severity="high"` `admin.break_glass.revoked`, immediately terminating access.

### 3. Atomic user suspension and last-admin protection

- Add `users.suspended_at` and `users.suspended_reason`.
- Suspending a user denies self-suspension (`409`) and locks active platform admins with `SELECT ... FOR UPDATE` to prevent suspending the last active platform admin (`409`).
- Suspension atomically sets `is_active=False`, revokes all active `UserSession` and `BreakGlassSession` rows, and emits `severity="high"` `admin.user.suspended`.
- Post-commit, `sync_authorized_keys` removes the suspended user's SSH keys; PAT authentication and `repository_access_for_actor` fail closed whenever `not actor.is_active`.

### 4. Audit severity and operational endpoints

- Add `audit_events.severity` (`normal` | `high`, indexed) and expose `severity` + `scope=all` (platform-admin gated) on `GET /api/v1/audit`, with hardened CSV formula escaping and export rate limiting.
- Expose sanitized `/api/v1/admin/overview`, `/api/v1/admin/health`, `/api/v1/admin/users`, `/api/v1/admin/organizations`, `/api/v1/admin/repositories`, and provisioning recovery actions (`/reset-provisioning`, `/retry-provisioning`) that never expose filesystem paths, DSNs, or raw subprocess errors.

## Consequences

- Private source code remains inaccessible to platform administrators by default; emergency access is always deliberate, bounded, visible to organization owners, and durably audited.
- Suspending a user immediately cuts off browser sessions, PATs, break-glass sessions, and SSH keys.
- Promotion to `platform_admin` remains an out-of-band operator/database action rather than a self-service API, preventing privilege escalation via HTTP mass assignment.
