# Control Plane

## Scope

Phase 1 establishes RevForge's browser-facing control plane:

- local user registration and login;
- database-backed opaque sessions;
- CSRF-protected cookie authentication for the React frontend;
- organizations, members, and roles;
- repository metadata and repository-specific permissions;
- structured audit events for important state changes.

This phase intentionally does not provision Mercurial repositories, touch `.hg`, or expose clone/pull/push transport.

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

## Repository metadata before provisioning

Repository rows represent control-plane metadata only:

- slug
- display name
- description
- visibility
- archive state
- creator identity

No filesystem path is stored. Phase 2 will map canonical organization and repository identifiers onto a controlled storage strategy.

## Audit-event scope

Phase 1 writes audit events for:

- user registration and login/logout;
- organization creation and metadata updates;
- member additions, role changes, and removals;
- repository creation, updates, archival state changes;
- repository permission grants, changes, and revocations.

Audit metadata stays minimal and excludes passwords, session tokens, CSRF values, request bodies, and internal paths.

## Deferred work

Phase 2 and later will add:

- physical Mercurial repository provisioning;
- canonical storage path mapping;
- Mercurial HTTP and SSH transport;
- changeset, file, and diff browsing;
- PATs, SSH keys, and external identity providers.
