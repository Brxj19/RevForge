# Control Plane

## Scope

Phases 1 and 2 establish RevForge's browser-facing control plane:

- local user registration and login;
- database-backed opaque sessions;
- CSRF-protected cookie authentication for the React frontend;
- organizations, members, and roles;
- repository metadata, repository-specific permissions, and provisioning state;
- structured audit events for important state changes.

Phase 2 provisions canonical local Mercurial repositories and exposes read-only browsing through a tightly controlled adapter.
Phase 3 adds Mercurial HTTP and SSH transport credentials plus native clone/pull/push gateways.

## Authentication and sessions

- Passwords are hashed with Argon2.
- Session tokens are random opaque values stored only in an `HttpOnly` cookie.
- The database stores only an HMAC digest of the session token, plus `created_at`, `expires_at`, `revoked_at`, and `last_seen_at`.
- The backend issues a session-bound CSRF token through `GET /api/v1/auth/csrf` and a readable CSRF cookie. Unsafe browser requests must send the same value in `X-CSRF-Token`.
- CORS remains explicitly configured for local frontend origins, and cookies are sent with `credentials: include`.

## Authorization model

Organization roles:

- `owner`
- `admin`
- `member`

Repository roles:

- `read`
- `write`
- `admin`

Repository visibility:

- `public`
- `internal`
- `private`

Policy summary:

- Organization owners and admins inherit full administrative access to every repository in the organization.
- Organization members can view organization metadata and `internal` repositories.
- Private repositories require explicit repository permissions unless the actor is an organization owner or admin.
- The last organization owner cannot be removed or demoted.
- Repository admins can manage repository metadata and explicit repository permissions, but do not gain organization-wide authority.

## Repository metadata and provisioning

Repository rows represent control-plane metadata only:

- slug
- display name
- description
- visibility
- archive state
- creator identity

Phase 2 adds:

- provisioning state (`unprovisioned`, `provisioning`, `ready`, `failed`);
- `provisioned_at`;
- a safe provisioning error code.

No filesystem path is stored. Physical storage is derived on demand from canonical organization and repository UUIDs.

## Mercurial adapter boundary

Every Mercurial-backed read request now follows this order:

1. resolve actor identity when present;
2. resolve organization and repository metadata through the database;
3. apply visibility and repository-permission policy;
4. derive the canonical repository path from immutable UUIDs;
5. confirm the repository is provisioned;
6. validate revision and repository-relative path inputs;
7. invoke the controlled `hg` adapter;
8. map the result into a typed API payload without leaking filesystem paths or raw Mercurial stderr.

Mercurial command execution remains bounded by:

- a configured executable path;
- allow-listed environment variables;
- per-command timeouts;
- stdout and stderr limits;
- safe diff and file-content size caps.

## Audit-event scope

Phase 1 writes audit events for:

- user registration and login/logout;
- organization creation and metadata updates;
- member additions, role changes, and removals;
- repository creation, updates, archival state changes;
- repository permission grants, changes, and revocations.

Audit metadata stays minimal and excludes passwords, session tokens, CSRF values, request bodies, and internal paths.

## Deferred work

Phase 4 and later will add:

- changeset, file, and diff browsing;
- webhooks, review workflows, and external identity providers.
