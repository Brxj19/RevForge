---
paths:
  - "backend/app/mercurial/**"
  - "backend/app/services/pr_diff_service.py"
  - "backend/app/services/event_spool.py"
  - "infra/ssh/**"
---

# Mercurial layer rules

- Only `HgCommandRunner` spawns `hg`; never use `subprocess` or a shell elsewhere.
- File arguments are hg patterns: pass `path:<relpath>` after `--`. Never pass a user string as a bare pattern.
- Validate revisions (40-hex node, safe ref name, or hex prefix) before use; build revsets only with formatspec (`repo.revs(b"... %s", value)`).
- Repository paths come only from `RepositoryStorageLocator.repository_path(repository)`.
- Write-capable transport must keep the `deny_read_only_write` hooks; push events are spooled with a unique idempotency key and handled asynchronously.
- The SSH gateway must not print to stdout before `sshserver(...).serve_forever()`; errors go to stderr as one short line.
- Protocol changes need a real `hg clone/pull/push` test against a disposable repo.
