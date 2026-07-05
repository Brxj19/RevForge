# ADR 004: Canonical Repository Storage

## Status

Accepted

## Context

RevForge Phase 2 needs physical Mercurial repositories on local disk, but filesystem paths must not be derived from user-controlled slugs or exposed through APIs.

## Decision

RevForge stores Mercurial repositories under a configured root:

```text
<REVFORGE_REPOSITORY_ROOT>/<organization_uuid>/<repository_uuid>
```

Rules:

- repository paths are derived only from trusted database UUIDs;
- the database does not persist absolute filesystem paths;
- slug changes do not move the repository;
- resolved paths must remain inside the configured repository root;
- unexpected symlink escape outside the root is rejected.

## Consequences

- repository renames are metadata-only operations;
- path traversal risk from slugs is removed from the storage layout;
- API and audit responses can stay free of host-specific paths;
- backup and restore workflows can rely on stable UUID-based storage.
