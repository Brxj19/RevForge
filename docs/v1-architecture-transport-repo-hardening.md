# V1 Architecture Hardening Note

## What was weak

- Clone URLs were composed in the frontend from `window.location.host`, which broke reverse-proxy, split-port, and custom SSH setups.
- Token creation exposed the wrong capability surface for transport and did not clearly support expiry or scoped usage.
- SSH key rendering hardcoded the forced-command entry instead of using deployable configuration.
- File-spooled push events were not guaranteed to become visible repository activity records.
- The top-level activity page shipped placeholder data instead of backend events.
- Session management and clone setup status were not exposed clearly in user settings.

## What was fixed

- Added a backend-owned repository transport metadata endpoint and switched the clone UI to consume it.
- Added public transport configuration for HTTPS and SSH URL generation, including custom SSH username and port support.
- Tightened PAT creation to v1 transport scopes (`read` and `write`), added expiry and org/repository scope fields, and enforced those scopes in the Mercurial HTTP gateway.
- Added session listing and revocation endpoints plus settings UI exposure.
- Made `authorized_keys` rendering use `REVFORGE_SSH_GATEWAY_COMMAND` so local and deployed SSH forced-command setups stay aligned.
- Normalized push event naming to `repository.push.accepted` and made file-spooled push events materialize as repository activity records.
- Replaced placeholder global activity rows with backend audit data.
- Extended changeset payloads with real insertions, deletions, and per-file change metadata derived from Mercurial output.

## Remaining limits

- Backend `mypy` still reports broad pre-existing strictness debt outside this slice, so the stronger signal for this work is the passing targeted test suites plus frontend type/lint checks.
- The top-level activity feed currently shows the authenticated user’s real audit trail rather than a cross-organization incident console.
