# RevForge Codex Workflow

This guide explains how Codex participates in RevForge without replacing engineering judgment or creating Git conflicts.

Codex is an implementation and review teammate. A human contributor remains accountable for scope, architecture decisions, secrets, approvals, test interpretation, and merging.

## 1. Ground rules

1. Run Codex from a dedicated feature branch or Git worktree, never from an uncommitted shared working directory.
2. Codex must read the applicable `AGENTS.md` files before editing.
3. Codex must not push to `main`, force-push, create releases, deploy production infrastructure, rotate secrets, or access private production data.
4. Codex must not receive plaintext secrets, private SSH keys, database dumps, customer repositories, or production credentials.
5. Codex must make changes only in the task's declared scope.
6. Codex must run relevant checks and report results, including failures.
7. A human must review the diff and approve the pull request before merge.
8. Security and protocol work requires explicit review by the `revforge_security` agent and a human reviewer.

## 2. Repository context Codex must use

Keep these files in the repository root:

```text
AGENTS.md                       # durable engineering constraints and commands
DESIGN.md                       # UI/product conventions
CONTRIBUTING.md                 # human Git and review workflow
docs/CODEX_WORKFLOW.md          # this operational guide
.agents/skills/*/SKILL.md       # reusable specialized workflows
.codex/agents/*.toml            # named custom agents
```

Codex automatically reads layered `AGENTS.md` guidance. More specific files nearer the current working directory override broader repository guidance. Keep `AGENTS.md` concise and truthful; put longer process documents in `docs/` and reference them from the root file.

## 3. Before starting a Codex task

### A. Use a clean, dedicated worktree

```bash
git fetch origin --prune
git worktree add ../revforge-rf-123 -b feat/RF-123-repository-create-api origin/main
cd ../revforge-rf-123
git status
```

Expected result:

```text
On branch feat/RF-123-repository-create-api
nothing to commit, working tree clean
```

Do not give Codex a dirty worktree unless the prompt explicitly says it is reviewing existing local changes.

### B. Give a complete prompt

A reliable task prompt has four parts:

```text
Goal:
Context:
Constraints:
Done when:
```

Template:

```text
Goal:
Implement [specific user-visible capability].

Context:
Read AGENTS.md, DESIGN.md, docs/CODEX_WORKFLOW.md, and the relevant skills.
Relevant area: [directory/files].
Current behavior: [brief facts, logs, or issue reference].

Constraints:
- Work only in [declared paths] unless a dependency requires a documented exception.
- Do not modify database schema / dependencies / deployment files unless explicitly listed.
- Preserve [security, compatibility, architecture constraint].
- Do not commit, push, or open a PR.
- Add focused tests.

Done when:
- [observable behavior]
- [tests/checks]
- Report changed files, exact commands run, results, and residual risks.
```

Avoid vague prompts like:

```text
Build the repository system.
Fix everything.
Make it production-ready.
```

## 4. Choosing the right Codex workflow

### Small, contained task

Use one implementation session for a single component, endpoint, or bug.

```text
Read AGENTS.md and inspect the existing repository service.
Implement validation for repository slugs in the service and API boundary.
Add focused tests for valid names, separators, dot segments, traversal attempts, and duplicates.
Do not change unrelated behavior. Do not commit or push.
Run the relevant checks and summarize the diff and results.
```

### Medium task that crosses one domain

First ask Codex to inspect and plan, then implement.

```text
Use plan mode. Inspect the repository creation path and write a short implementation plan:
affected files, API contract, validation rules, tests, and migration impact.
Do not edit yet.
```

After reviewing the plan:

```text
Implement the approved plan. Keep the work scoped to the backend repository-creation flow.
Do not change the frontend or deployment configuration.
Add tests, run the required checks, and report results.
```

### Complex or security-sensitive task

Explicitly use specialized agents. Codex only starts subagents when requested.

```text
Spawn revforge_explorer and revforge_security in parallel.
Inspect the current HTTP Mercurial gateway and report:
1. authorization flow,
2. repository-path resolution,
3. command execution,
4. concrete vulnerabilities or gaps,
5. exact files and tests affected.
Do not edit files. Wait for both results and consolidate them into a plan.
```

Then, after approving the plan:

```text
Spawn revforge_mercurial to implement the approved gateway change and
revforge_qa to prepare isolated fixture-repository coverage.
Keep them in separate file ownership areas.
After implementation, spawn revforge_security to review the diff against main.
Do not commit or push. Return the final diff summary, test results, and unresolved risks.
```

## 5. Agent selection matrix

| Task | Primary agent | Supporting agent |
|---|---|---|
| Locate current behavior and dependencies | `revforge_explorer` | `revforge_lead` |
| Repository init, history, diffs, hooks, HTTP/SSH | `revforge_mercurial` | `revforge_security`, `revforge_qa` |
| API, DB, roles, audit events, jobs | `revforge_backend` | `revforge_security`, `revforge_qa` |
| Pages, navigation, diffs, reviews, accessibility | `revforge_frontend` | `revforge_qa` |
| Threat model and diff review | `revforge_security` | `revforge_explorer` |
| Test strategy and regression suite | `revforge_qa` | relevant implementation agent |
| Docker, TLS, database, backups, observability | `revforge_operations` | `revforge_security` |
| Multi-domain feature planning | `revforge_lead` | specialist agents as needed |

Use `revforge_explorer` and `revforge_security` in read-only mode. They should not implement changes.

## 6. Required Codex review loop

For every non-trivial task:

1. **Inspect** — read instructions, trace current behavior, identify exact scope.
2. **Plan** — state files to change, risks, tests, and acceptance criteria.
3. **Implement** — make the narrowest change that meets the plan.
4. **Verify** — run formatting, linting, type checks, unit/integration/e2e checks that apply.
5. **Review** — ask Codex to review the diff against `main`.
6. **Human review** — inspect the diff and tests before opening/merging the PR.

Suggested review prompt:

```text
Review this branch against origin/main as a skeptical RevForge maintainer.
Prioritize:
- authorization or tenant-isolation regressions,
- unsafe filesystem or Mercurial subprocess behavior,
- API compatibility issues,
- missing tests,
- race conditions,
- accidental scope expansion.

Do not edit files. Return only prioritized findings with file paths, impact, and recommended fix.
```

Codex CLI also provides `/review` for reviewing a branch, working-tree changes, or commit.

## 7. File ownership when using multiple agents

Do not send two write-capable agents into the same files at the same time.

Example safe division:

```text
revforge_mercurial
  owns: backend/mercurial/*, tests/mercurial/*

revforge_backend
  owns: backend/api/*, backend/domain/*, migrations/*

revforge_frontend
  owns: frontend/src/*

revforge_qa
  owns: tests/integration/*, tests/e2e/*

revforge_operations
  owns: docker/*, deploy/*, scripts/backup*, docs/operations/*
```

When shared contracts must change, sequence work:

1. Backend/API contract first.
2. Frontend client update second.
3. QA integration coverage third.
4. Security review last.

## 8. Safety boundaries for RevForge

Codex prompts must repeat these constraints for tasks touching repository access:

```text
- Resolve repositories through immutable repository ID -> database record -> canonical path.
- Never accept a raw filesystem path from an HTTP request or SSH command.
- Do not use shell interpolation for hg commands.
- Use command argument arrays, controlled environment, timeout, and bounded output.
- Authorize before filesystem access, hg invocation, or protocol handoff.
- Never log clone credentials, SSH keys, tokens, internal paths, or full environment variables.
- Treat hooks and outbound webhooks as untrusted integrations.
```

### Stop and ask for human direction

Codex must stop instead of guessing when a task would:

- Require a database migration with unclear backward compatibility.
- Change authorization semantics or default repository visibility.
- Alter SSH/HTTP transport protocol behavior.
- Delete a repository, prune data, rewrite Git history, or clean a storage volume.
- Add a production dependency, network integration, or secret.
- Bypass a failing test or weaken security checks to make the suite green.

## 9. Codex completion report

Every Codex task should finish with this exact structure:

```text
Summary
- What changed.

Files changed
- path — purpose.

Validation
- command — pass/fail/result.
- command — pass/fail/result.

Behavior verified
- Observable outcomes.

Risks / follow-ups
- Known limitation, skipped test, migration, or decision needed.

Git status
- Branch name.
- Clean or uncommitted changes.
- No commit/push performed unless explicitly requested.
```

This makes it easy for a human contributor to pick up the work, test it, and prepare the PR.

## 10. Recommended team workflow

```text
Issue / task
  ↓
Human claims scope and creates branch/worktree
  ↓
Codex explores or plans
  ↓
Human approves plan for non-trivial work
  ↓
Codex implements and tests
  ↓
Codex security/QA review
  ↓
Human inspects diff and runs any final local checks
  ↓
Human commits, pushes, and opens PR
  ↓
Human reviewer approves
  ↓
Squash merge to main
```

### Commit and push policy

Default policy:

- Codex may edit and test.
- Codex may create a commit only when explicitly asked.
- Codex must not push, force-push, merge a PR, tag a release, or deploy unless a human gives a specific one-time instruction.
- The contributor checks `git diff`, creates the final commit, and pushes the branch.

This keeps the Git history intentional and prevents accidental changes from being published.

## 11. Useful prompts

### Start a feature safely

```text
Read AGENTS.md, CONTRIBUTING.md, DESIGN.md, and docs/CODEX_WORKFLOW.md.
Use plan mode for RF-123: repository creation API.
First inspect the current code and produce a plan with affected files, API behavior,
validation, tests, security implications, and migration impact.
Do not edit anything yet.
```

### Ask for a targeted implementation

```text
Implement only the approved RF-123 backend plan.
Scope: backend/repositories/, backend/api/repositories.py, tests/repositories/.
Constraints: no migration, no new dependency, no frontend changes, no commit or push.
Add focused tests and run the project-required checks.
Return the standard completion report.
```

### Review before PR

```text
Review this branch against origin/main using the RevForge security boundaries in AGENTS.md.
Do not edit files.
Find only actionable issues that could cause authorization bypass, path escape,
unsafe hg invocation, data loss, broken API compatibility, or missing regression coverage.
```

### Work with a design change

```text
Read DESIGN.md and inspect the existing repository overview page.
Implement the approved empty state for a repository with no commits.
Maintain keyboard accessibility and responsive behavior.
Use only existing design tokens and components.
Add relevant frontend tests. Do not commit or push.
```

## 12. Maintaining the Codex setup

When Codex repeatedly makes the same mistake:

1. Add a concise, verifiable rule to the closest `AGENTS.md`.
2. Put detailed workflows in a `SKILL.md` under `.agents/skills/`.
3. Add a read-only reviewer agent when the failure mode is security or architecture related.
4. Update this document only when the team process itself changes.
5. Keep agent instructions short enough that they remain practical and are actually followed.

Do not add rules for hypothetical problems. Add them after observing real project friction.
