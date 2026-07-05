# Mercurial Adapter

## Purpose

Phase 2 adds a narrow RevForge-to-Mercurial boundary for local repository provisioning and read-only browsing.
RevForge remains the control plane. Mercurial remains the source of truth for repository format, manifests, changesets, branches, tags, bookmarks, and file history.

## Boundary

RevForge owns:

- authentication, sessions, CSRF, and authorization;
- repository metadata and provisioning state;
- canonical storage mapping from trusted UUIDs;
- audit events;
- safe command orchestration and typed API responses.

Mercurial owns:

- `.hg` repository structure;
- revlogs and manifests;
- changeset metadata;
- diff generation;
- branch, tag, and bookmark resolution.

RevForge does not write inside `.hg` directly and does not reimplement Mercurial storage or wire protocol behavior.

## Storage mapping

The backend uses `REVFORGE_REPOSITORY_ROOT` plus immutable UUIDs:

```text
<repository_root>/<organization_uuid>/<repository_uuid>
```

Characteristics:

- slugs never determine the physical path;
- repository renames do not move data;
- absolute paths are not stored in the database;
- API responses, validation errors, and audit metadata do not expose raw storage paths;
- resolved paths must stay inside the configured root.

## Request flow

Every Mercurial-backed request follows this sequence:

1. authenticate when required;
2. resolve organization and repository metadata from the database;
3. authorize visibility and repository access;
4. derive the canonical storage path;
5. verify provisioning state;
6. validate revision and repository-relative path inputs;
7. invoke the dedicated Mercurial adapter method;
8. map the result into a safe typed response.

Unauthorized users do not learn whether a private repository has been provisioned or contains data.

## Controlled command execution

The command runner:

- resolves a configured `hg` executable;
- uses argv arrays only;
- never uses `shell=True`;
- provides a minimal environment (`HGPLAIN=1`, empty `HGRCPATH`, controlled locale);
- enforces command timeout, stdout, and stderr limits;
- classifies common Mercurial failures into stable application errors.

Relevant environment settings:

- `REVFORGE_HG_EXECUTABLE`
- `REVFORGE_HG_COMMAND_TIMEOUT_SECONDS`
- `REVFORGE_HG_MAX_STDOUT_BYTES`
- `REVFORGE_HG_MAX_STDERR_BYTES`
- `REVFORGE_MAX_DIFF_BYTES`
- `REVFORGE_MAX_FILE_CONTENT_BYTES`
- `REVFORGE_MAX_HISTORY_PAGE_SIZE`

## Provisioning lifecycle

Repositories move through:

- `unprovisioned`
- `provisioning`
- `ready`
- `failed`

Provisioning:

- locks the repository row;
- creates canonical parent directories;
- runs `hg init`;
- validates the repository through the adapter;
- records `repository.provision_requested`, `repository.provisioned`, or `repository.provision_failed`.

Failed provisioning stores only a safe error code and may clean up the exact target directory when safe.

## Revision and path validation

Supported revision inputs:

- latest tip;
- full 40-character node ID;
- approved branch name;
- approved tag name;
- approved bookmark name.

Unsupported:

- arbitrary revsets;
- generic template input;
- path traversal;
- `.hg` access;
- absolute paths;
- backslashes and NUL bytes.

## File and diff behavior

- text files are returned inline when they fit configured limits;
- binary files return metadata without content;
- oversized files return metadata without content;
- oversized diffs return truncated content plus a truncation reason.

## Deferred to Phase 3

- Mercurial HTTP clone, pull, and push transport;
- SSH transport;
- SSH keys and PATs;
- hooks, webhooks, and background post-push work.
