# Contributing to RevForge

RevForge is built with Git, even though the product itself hosts Mercurial repositories. This guide defines how human contributors and Codex collaborate safely without overwriting each other's work.

## 1. Non-negotiable rules

1. Never push directly to `main`.
2. Every code change reaches `main` through a reviewed pull request.
3. One person or one Codex session owns a logical change area at a time.
4. Keep pull requests small, focused, and independently testable.
5. Do not mix refactors, formatting sweeps, dependency upgrades, and product behavior changes in one pull request.
6. Do not commit secrets, `.env` files, private SSH keys, tokens, database dumps, local Mercurial repositories, or generated build output.
7. Changes involving authentication, RBAC, repository paths, `hg` subprocesses, SSH, HTTP transport, hooks, or backups require a security review.
8. The repository's `AGENTS.md` is binding for Codex sessions. Follow the closest applicable `AGENTS.md` when working in a nested directory.

## 2. Branch model

Use a lightweight trunk-based workflow.

```text
main
 ├── feat/RF-123-repository-create-api
 ├── fix/RF-141-reject-path-traversal
 ├── docs/RF-152-setup-guide
 └── chore/RF-161-update-local-tooling
```

### Protected branch

`main` must be protected in the remote host:

- Pull request required before merge.
- At least one human approval required.
- Required checks must pass.
- Force pushes disabled.
- Branch deletion disabled.
- Squash merge enabled and preferred.
- Direct push restricted to repository administrators only for emergency recovery.

### Branch naming

Use lowercase kebab-case and a ticket number when one exists.

| Change type | Pattern | Example |
|---|---|---|
| Feature | `feat/RF-123-short-description` | `feat/RF-123-repository-create-api` |
| Bug fix | `fix/RF-123-short-description` | `fix/RF-141-reject-path-traversal` |
| Security fix | `security/RF-123-short-description` | `security/RF-149-lock-down-ssh-parser` |
| Documentation | `docs/RF-123-short-description` | `docs/RF-152-contributor-guide` |
| Refactor | `refactor/RF-123-short-description` | `refactor/RF-155-repository-service` |
| Tests | `test/RF-123-short-description` | `test/RF-156-http-gateway-fixtures` |
| Chore/tooling | `chore/RF-123-short-description` | `chore/RF-161-python-tooling` |
| Urgent production fix | `hotfix/RF-123-short-description` | `hotfix/RF-170-login-regression` |

Do not use vague branch names such as `new`, `changes`, `test`, `final`, or `brajesh-work`.

## 3. Daily contributor workflow

### A. Start from an updated main branch

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
```

`--ff-only` prevents Git from silently creating a merge commit while updating your local `main`.

### B. Create one focused branch

```bash
git switch -c feat/RF-123-repository-create-api
```

Before writing code, read:

```text
README.md
AGENTS.md
DESIGN.md
docs/
.agents/skills/
```

Also read any `AGENTS.md` inside the directory you are changing.

### C. Implement in small, logical commits

Inspect changes often:

```bash
git status
git diff
git diff --check
```

Stage intentionally:

```bash
git add -p
git commit -m "feat(repos): add repository creation service"
```

Do not use `git add .` blindly. Review the staged patch first:

```bash
git diff --cached
```

### D. Keep your branch current

Before opening or updating a pull request:

```bash
git fetch origin
git rebase origin/main
```

If conflicts happen:

```bash
git status
# resolve the listed files carefully
git add <resolved-files>
git rebase --continue
```

To stop and return to the state before the rebase:

```bash
git rebase --abort
```

Do **not** use `git push --force` after rebasing. Use the safer lease-protected form:

```bash
git push --force-with-lease
```

### E. Run the required checks

Run the commands specified by the root and directory-level `AGENTS.md` files. At minimum, a feature PR should run the relevant formatter, linter, type checker, unit tests, and integration tests.

Record the exact commands and results in the pull request description.

### F. Push and open a pull request

```bash
git push -u origin feat/RF-123-repository-create-api
```

Open a PR against `main` using the repository template. The PR should explain:

- What changed and why.
- Scope deliberately excluded.
- Security or data implications.
- Migrations, configuration, or deployment changes.
- Tests run and their result.
- Rollback plan when a change is operationally risky.

### G. Merge and clean up

After approval and checks:

1. Squash merge into `main`.
2. Delete the remote branch.
3. Update local main.
4. Delete your merged local branch.

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/RF-123-repository-create-api
```

## 4. Commit-message convention

Use Conventional Commit-style messages:

```text
type(scope): concise imperative summary
```

Examples:

```text
feat(repos): add repository creation service
fix(authz): reject cross-organization repository access
security(ssh): allow only configured Mercurial transport commands
test(protocol): cover unauthorized pull requests
docs(ops): document restore drill
chore(ci): cache frontend dependencies
```

Recommended types:

- `feat`
- `fix`
- `security`
- `refactor`
- `test`
- `docs`
- `chore`
- `build`
- `ci`
- `perf`

Rules:

- Use imperative language: `add`, `reject`, `prevent`, `document`.
- Keep the first line under 72 characters.
- Make one logical change per commit when practical.
- Do not use `WIP`, `final`, `fix`, or `changes` as the complete commit message.

## 5. Ownership and collaboration

### File ownership

Before starting work, post the intended scope in the issue or team channel:

```text
RF-123 — I am working on repository creation.
Expected files: backend/repositories/*, migrations/*, tests/repositories/*
I will not modify frontend files except API contract types.
```

When a change crosses domains, split it into owned parts:

| Area | Primary owner |
|---|---|
| Mercurial lifecycle, protocol adapter, hooks | Mercurial contributor / `revforge_mercurial` |
| APIs, PostgreSQL, RBAC, audit events | Backend contributor / `revforge_backend` |
| UI, pages, client API integration | Frontend contributor / `revforge_frontend` |
| Threat review | `revforge_security` plus human reviewer |
| Test plan and regression coverage | QA contributor / `revforge_qa` |
| Docker, proxy, backups, deployment | Operations contributor / `revforge_operations` |

### Avoiding collisions

Use Git worktrees when two streams must proceed in parallel:

```bash
git fetch origin
git worktree add ../revforge-rf-123 -b feat/RF-123-repository-create-api origin/main
git worktree add ../revforge-rf-124 -b feat/RF-124-repository-page origin/main
```

Each worktree has its own working directory and branch. Do not open two editing tools against the same worktree.

List worktrees:

```bash
git worktree list
```

Remove a completed worktree only after its branch is merged:

```bash
git worktree remove ../revforge-rf-123
```

## 6. Handling conflicts and accidental changes

### Merge/rebase conflict

1. Stop and understand both changes.
2. Preserve intended behavior from both branches; do not choose one side automatically.
3. Re-run the affected tests after resolving.
4. Ask the original author for help when a security or protocol boundary is unclear.

### Accidental local edits

```bash
git status
git diff
```

To set aside incomplete work safely:

```bash
git stash push -u -m "wip: describe the work"
```

Restore it later:

```bash
git stash pop
```

Do not use `git reset --hard` or `git clean -fd` unless you fully understand which files will be lost.

### Accidental sensitive commit

Do not simply delete the file in the next commit. Treat it as exposed:

1. Revoke or rotate the secret immediately.
2. Notify the repository administrator privately.
3. Remove it from the current branch and history using an agreed recovery process.
4. Add prevention: `.gitignore`, secret scanning, or pre-commit checks.

## 7. Pull-request review policy

A reviewer checks more than style.

### Every PR

- Is the scope clear and minimal?
- Do tests cover the changed behavior?
- Is the API or UI behavior documented where needed?
- Does the change preserve backward compatibility or explain the migration?
- Are generated files, debug logs, and unrelated formatting excluded?

### Security-sensitive PRs

Require an additional review for:

- Login, session, token, or OAuth changes.
- Organization membership and roles.
- Repository access policy.
- Canonical path mapping, filesystem access, or symlink handling.
- `hg` command creation or execution.
- HTTP/SSH transport gateways.
- Webhooks, outbound requests, secrets, backups, and restore scripts.

The reviewer should explicitly confirm:

```text
Authorization enforced before filesystem and Mercurial access.
No raw user path becomes a repository filesystem path.
No shell interpolation is introduced.
No internal paths, credentials, or raw stack traces leak.
```

## 8. Definition of done

A change is ready to merge only when:

- The issue acceptance criteria are satisfied.
- The implementation matches `AGENTS.md`, architecture guidance, and `DESIGN.md`.
- Focused tests are added or updated.
- Required checks pass.
- Security-sensitive behavior is reviewed.
- Documentation, migration notes, and operational changes are included when applicable.
- The PR description is complete.
- A human reviewer approves the change.

## 9. Fast reference

```bash
# Update main
git fetch origin --prune
git switch main
git pull --ff-only origin main

# Create feature branch
git switch -c feat/RF-123-short-description

# Inspect and commit intentionally
git status
git diff
git add -p
git diff --cached
git commit -m "feat(scope): concise summary"

# Update before PR
git fetch origin
git rebase origin/main

# Push
git push -u origin feat/RF-123-short-description

# After merge
git switch main
git pull --ff-only origin main
git branch -d feat/RF-123-short-description
```
