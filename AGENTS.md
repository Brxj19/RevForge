# RevForge Agent Instructions

## Mission

Build **RevForge**: a secure, self-hosted, Mercurial-native forge for repository hosting, browser-based history inspection, controlled HTTPS/SSH access, teams and permissions, review workflows, auditability, webhooks, and reliable operations.

RevForge is not a Kallithea fork and not a custom version-control system. Use Kallithea only as an external behavioural reference. Independently implement the product.

## Product and architecture baseline

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router.
- **Control plane:** Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic.
- **Protocol layer:** a dedicated WSGI-compatible Mercurial HTTP gateway; do not funnel native Mercurial wire-protocol requests through ad hoc FastAPI endpoints.
- **SSH:** OpenSSH plus a constrained forced-command gateway; never use a general interactive shell account for repository access.
- **Data:** PostgreSQL for product metadata; Redis for jobs, cache, rate limiting, and invalidation; local persistent filesystem for repositories at first.
- **Operations:** Docker Compose for local/small-team deployment; Linux is the intended production host.
- **Repository storage:** native Mercurial repositories only. All mutations must go through Mercurial-supported commands or library entrypoints.

## Core invariants

1. Keep standard client compatibility: `hg clone`, `hg pull`, and `hg push` must work without a RevForge-specific Mercurial client.
2. Never construct shell command strings from user input. Use argument arrays, fixed working directories, a minimal environment, and explicit timeouts.
3. Never write inside `.hg` directly from web/API code.
4. Every repository path must be derived from canonical database IDs and validated slugs. Reject traversal, symlinks outside the storage root, ambiguous normalization, and hidden path tricks.
5. Deny by default. A missing identity, inactive account, archived repository, or ambiguous role never grants access.
6. Treat SSH commands, repository names, webhook URLs, commit messages, diffs, rendered files, and headers as untrusted input.
7. Create immutable audit events for permission changes, credential changes, repository lifecycle events, protocol access, pushes, administrative actions, and webhook configuration changes.
8. Prefer small vertical slices with tests over broad scaffolding that does not work end to end.
9. Avoid premature service decomposition. Preserve module boundaries inside a modular monolith first.
10. Do not add a dependency, database extension, cloud service, or irreversible migration without explaining why it is needed in the PR/task summary.

## Canonical monorepo layout

```text
revforge/
├── apps/
│   ├── web/                       # React application
│   ├── api/                       # FastAPI control plane
│   ├── hg_http_gateway/           # WSGI-compatible Mercurial protocol gateway
│   ├── ssh_gateway/               # OpenSSH forced-command executable
│   └── worker/                    # asynchronous jobs
├── packages/
│   ├── domain/                    # roles, policy primitives, shared models
│   ├── mercurial_adapter/         # narrow native-Hg integration boundary
│   ├── audit/                     # event schema and writers
│   └── ui/                        # shared frontend components/tokens
├── infra/
│   ├── compose/
│   ├── caddy/
│   ├── postgres/
│   ├── scripts/
│   └── systemd/
├── docs/
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── security/
├── AGENTS.md
└── DESIGN.md
```

Create this structure only when it serves the current milestone; do not create empty directories solely to resemble this diagram.

## Quality gates

Before declaring a task complete:

1. Run targeted tests first, then the relevant full test suite where practical.
2. Run formatter, linter, and type checker for every changed language.
3. Add or update tests for all bug fixes and user-visible behaviour.
4. Verify authorization separately for `read`, `write`, `admin`, unauthenticated, wrong-organization, suspended-user, and archived-repository cases when relevant.
5. For protocol work, test with real `hg` client commands against a disposable repository. Never treat mocked protocol tests as sufficient.
6. For data migrations, test forward migration and document rollback or recovery behaviour.
7. For frontend changes, verify keyboard flow, narrow viewport behaviour, empty/loading/error states, and dark/light visual consistency.
8. Summarize changed files, validation commands, known limitations, and any follow-up work.

## Definition of permissions

Use these semantic permissions consistently:

| Permission | Allows | Does not allow |
|---|---|---|
| `read` | Browse code, clone, pull, inspect history | Push, configure repository, manage credentials |
| `write` | Everything in read; push approved changes | Change repository settings or permissions |
| `admin` | Everything in write; repository settings, hooks, membership/policy within delegated scope | Global platform administration unless separately granted |
| `platform_admin` | Global administration and incident operations | Implicit access to private code unless explicitly designed and audited |

Do not overload “owner” as a role without defining exactly which permissions it grants.

## Implementation workflow

### For small, localized tasks

Work directly when the change is isolated, has one clear owner area, and can be validated locally. Read the relevant skill first when one matches the task.

Examples: a React table state fix, a repository-slug validation bug, one migration, a focused unit test, documentation correction.

### For medium or high-risk tasks

Use the subagent workflow below when the task affects authentication, authorization, Mercurial protocol access, SSH, persistence, multiple applications, security-sensitive input, migrations, or production operations.

Do not start implementation before an explorer or domain expert has mapped the affected files and acceptance criteria, unless the user explicitly asks for a quick narrow patch.

## Explicit subagent orchestration plan

Codex only spawns subagents when explicitly requested. For qualifying tasks, use this sequence and ask the user-facing parent agent to wait for all required results before integrating them.

### Phase A — Discover

Spawn in parallel, read-only:

1. **`codebase-explorer`**
   - Map relevant modules, data flow, current conventions, tests, and architectural constraints.
   - Return evidence with file paths, not guesses.

2. **`mercurial-protocol-expert`** for Hg HTTP, SSH, hooks, repository reads/writes, locks, or server configuration.
   - Identify native Mercurial API/CLI entrypoints and actual client-level test commands.
   - Flag protocol compatibility and locking risks.

3. **`security-reviewer`** for identity, authorization, paths, SSH, webhook, input parsing, secrets, process execution, or new externally reachable endpoints.
   - Produce a concise threat model: assets, trust boundaries, abuse cases, required controls.

Do not run write-capable agents in Phase A.

### Phase B — Plan and contract

The parent agent synthesizes findings into:

- precise user story;
- API and domain contract;
- authorization matrix;
- affected packages;
- migration/data impact;
- failure and rollback handling;
- test matrix;
- explicit non-goals.

For large work, record the decision in `docs/adr/` before implementation.

### Phase C — Implement

Spawn no more than two write-capable agents in parallel unless their file ownership is completely disjoint.

- **`backend-platform-engineer`** owns API, domain, migrations, policy code, and worker changes.
- **`frontend-product-engineer`** owns React, design-system components, interactions, accessibility, and frontend tests.
- **`mercurial-protocol-expert`** owns `mercurial_adapter`, HTTP gateway, SSH gateway, hook, and native-client integration changes.
- **`platform-operations-engineer`** owns Docker Compose, proxy configuration, runbooks, backups, observability, and deployment scripts.

Each implementation agent must restrict modifications to agreed ownership boundaries and report changed files, commands run, and unresolved risks.

### Phase D — Integrate and review

After the implementation agents finish:

1. Parent agent resolves integration boundaries and runs the combined test suite.
2. Spawn **`qa-release-reviewer`** to inspect the diff and test evidence for correctness, regression coverage, and release notes.
3. Spawn **`security-reviewer`** again for high-risk changes only; it reviews the actual diff rather than just the plan.
4. Parent agent fixes confirmed issues, reruns affected tests, and reports the final evidence.

### Recommended subagent prompt

```text
Spawn the codebase explorer, mercurial protocol expert, and security reviewer in parallel for <feature>. They must stay read-only and return: relevant files, current behaviour, risks, acceptance criteria, and tests. Wait for all findings, synthesize an implementation plan, and do not change code until the plan is complete.
```

### Never parallelize these without strict ownership

- Multiple agents editing the same migration chain.
- Multiple agents changing the same authorization/policy module.
- Multiple agents modifying the Mercurial protocol gateway.
- Multiple agents editing root Compose/proxy configuration.
- Broad formatting/refactoring mixed with functional changes.

## Mercurial-specific rules

- Use the real `hg` executable and/or supported Mercurial Python APIs; pin and document the supported Mercurial version range.
- All commands must receive a controlled environment: fixed `PATH`, `HGRCPATH` policy, repository root, locale, timeouts, and output limits.
- Set `--repository` / `-R` only from a canonical internal path, never from raw request input.
- Prevent uncontrolled user/global Mercurial configuration from changing server behaviour.
- Use a single repository-level write coordination policy. Do not invent an application lock that fights native Mercurial transaction locks.
- After successful pushes, enqueue post-push work asynchronously. Do not hold the protocol response open for indexing, notifications, or webhooks.
- Treat hook execution as a privileged boundary. Initial hooks should be platform-owned and declarative; arbitrary repository shell hooks are not an MVP feature.
- Support standard Mercurial URLs and document authentication format. Never expose access tokens in logs, URLs, telemetry, or browser history.

## Security rules

- Secrets only enter through environment variables or secret managers; never commit `.env` files with production values.
- Hash personal access tokens with a slow password hash or a keyed digest strategy; show plaintext only once when created.
- Store SSH public keys as normalized public-key records. Reject key options/types not deliberately supported.
- Use CSRF protection for state-changing browser sessions; use secure, HttpOnly, SameSite cookies when cookie auth is used.
- Rate-limit login, token validation, SSH key lookup, repository discovery, and webhook delivery retries.
- Validate webhook destinations to mitigate SSRF; block loopback, link-local, private, metadata, and internal ranges unless an explicit trusted-network policy permits them.
- Never log credentials, authorization headers, private repository paths unnecessarily, raw SSH commands, or complete webhook payloads by default.
- Every administrative “break glass” capability must have separate authorization and a high-severity audit event.

## Frontend rules

- Follow `DESIGN.md` and use the shared UI package rather than duplicating primitives.
- Optimize for dense code/history information, not marketing-dashboard aesthetics.
- Keep primary actions obvious: Clone, Browse, Compare, Create review, Push guidance, Settings.
- Provide an accessible non-colour indicator for state; status colour alone is insufficient.
- Preserve URL-addressable state for repository tabs, revisions, file paths, comparisons, filters, and pagination.
- Render untrusted repository content safely. Use text rendering by default; sanitize and isolate any rich preview.

## Documentation rules

- Update relevant `docs/` content when public behaviour, APIs, setup, config, or runbooks change.
- Write short Architecture Decision Records for choices that are expensive to reverse: auth model, protocol gateway approach, path strategy, repository storage, events, and review semantics.
- Keep code comments for constraints and non-obvious reasoning, not narration of obvious syntax.

## Completion report template

```text
## Completed
- <behaviour delivered>

## Key implementation decisions
- <decision and reason>

## Validation
- `<command>` — <result>

## Security / operations impact
- <controls added or none>

## Follow-ups
- <known limits, migration, or next slice>
```
## Phase delivery and Git completion rule

At the end of every completed RevForge phase, Codex must complete the full Git delivery workflow unless a required check, review, authentication requirement, or branch-protection rule prevents it.

### Required sequence

After implementation, reviews, and all required validation succeed:

1. Inspect the final working tree and ensure only phase-related changes are included.
2. Run the required formatter, linter, type checker, tests, migration checks, and CI-equivalent commands.
3. Run a final review against `origin/main`.
4. Stage only the intended files.
5. Create a clean Conventional Commit-style commit.
6. Push the feature branch to `origin`.
7. Create a pull request targeting `main`.
8. Wait for required checks and required approvals.
9. Squash merge the pull request into `main`.
10. Delete the remote feature branch.
11. Switch the local repository to `main`.
12. Pull the merged `main` branch using fast-forward only.
13. Delete the local feature branch.
14. Confirm that the final local working tree is clean and on updated `main`.

### Safety rules

* Never merge when required CI checks are failing.
* Never bypass branch protection, required reviews, or required status checks.
* Never force-push to `main`.
* Never merge a pull request containing unrelated files, secrets, generated artifacts, debug output, private data, or unfinished work.
* Use squash merge unless the repository maintainer explicitly requests another merge strategy.
* Use `git push --force-with-lease` only when rebasing a feature branch requires it. Never use plain `git push --force`.
* Do not self-approve a pull request when repository rules require independent human approval.
* If GitHub CLI authentication, repository permissions, CI checks, required approvals, or merge permissions prevent completion, push the feature branch and create the PR if possible. Then stop and report the exact blocker.
* Never delete the local feature branch until the pull request is confirmed merged.
* Never delete the remote feature branch before the merge succeeds.

### Standard commands

Codex should adapt names and paths to the active phase branch.

```bash
git status
git diff --check
git fetch origin --prune

# Run project validation before committing.
make format
make lint
make test

# Review the final change against main.
git diff origin/main...HEAD
```

Stage and commit only intended files:

```bash
git add -p
git diff --cached
git commit -m "feat(phase): complete phase N description"
```

Push and create the pull request:

```bash
git push -u origin <feature-branch>

gh pr create \
  --base main \
  --head <feature-branch> \
  --title "feat: complete Phase N — <phase name>" \
  --body-file .github/pull_request_template.md
```

Check required pull-request status checks:

```bash
gh pr checks --required --watch
```

After all required checks and approvals pass:

```bash
gh pr merge --squash --delete-branch
```

After the merge succeeds:

```bash
git switch main
git pull --ff-only origin main
git branch -d <feature-branch>
git status
```

### Required final report

At phase completion, report:

```text
Git delivery
- Feature branch:
- Commit SHA:
- Commit message:
- Pull request URL:
- Validation checks:
- Merge method:
- Remote feature branch deleted: yes/no
- Local feature branch deleted: yes/no
- Current branch:
- Current main SHA:
- Working tree clean: yes/no
- Any blocker:
```
