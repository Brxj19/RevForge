## What changed

<!-- Explain the user-visible or system behavior change. -->

## Why

<!-- Link the issue/task and explain the reason for the change. -->

## Scope

- [ ] Backend/API
- [ ] Database migration
- [ ] Mercurial integration or hook
- [ ] HTTP/SSH transport
- [ ] Frontend/UI
- [ ] Infrastructure/operations
- [ ] Documentation only

## Security and data impact

<!-- For sensitive changes, explain authorization, path, subprocess, secret, or data implications. -->
- [ ] No security-sensitive behavior changed.
- [ ] Security review requested or completed.
- [ ] Authorization checked before repository/filesystem/Mercurial access.
- [ ] No raw request path is used as a repository filesystem path.
- [ ] No shell interpolation or secret exposure introduced.

## Validation

<!-- Paste exact commands and concise outcomes. -->
```text
command:
result:

command:
result:
```

## Screenshots / recordings

<!-- Required for user-facing UI changes, when useful. -->

## Rollout / rollback notes

<!-- Required for migrations, API behavior changes, transport changes, hooks, backups, or infrastructure. -->

## Checklist

- [ ] Branch is rebased on current `main`.
- [ ] PR is focused; unrelated changes removed.
- [ ] Tests added or updated where behavior changed.
- [ ] Required local checks pass.
- [ ] Documentation updated where needed.
- [ ] No secrets, dumps, generated build files, or private repository data included.
- [ ] I reviewed the final diff.
