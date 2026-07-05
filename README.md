# RevForge Codex Starter Kit

This directory contains project guidance for building **RevForge**, a self-hosted, Mercurial-native source-control and code-collaboration platform.

Copy the contents into the root of the `revforge` repository before starting implementation:

```text
revforge/
├── AGENTS.md
├── DESIGN.md
├── .agents/
│   └── skills/
│       └── ...
└── .codex/
    └── agents/
        └── ...
```

## What is included

| Path | Purpose |
|---|---|
| `AGENTS.md` | Root project rules, development workflow, and the explicit subagent orchestration plan. |
| `DESIGN.md` | Product identity, design system, screen specifications, accessibility rules, and frontend UX acceptance criteria. |
| `.agents/skills/*/SKILL.md` | Focused reusable workflows for Mercurial protocol work, backend, frontend, security, testing, and operations. |
| `.codex/agents/*.toml` | Project-scoped custom subagents for parallel, specialized Codex work. |

## How to use with Codex

Start Codex from the repository root so it loads `AGENTS.md` and discovers the skills:

```bash
cd ~/Documents/revforge
codex
```

Use normal prompts for narrow tasks:

```text
Implement repository creation with organization-scoped uniqueness. Use the RevForge backend skill and write migration, API tests, and audit events.
```

Ask explicitly for parallel work when a task has independent parts:

```text
Spawn the Mercurial protocol expert, security reviewer, backend platform engineer, and QA reviewer. Have them inspect the repository-access implementation, wait for all of them, then propose one integrated plan. Do not modify code yet.
```

For a larger feature:

```text
Use the subagent plan in AGENTS.md. Build the HTTPS Mercurial gateway in small vertical slices. First have the explorer and protocol specialist produce findings; then implement with the backend engineer; finally ask security and QA agents to review the diff.
```

## Initial build sequence

1. Create the monorepo skeleton and local Docker Compose environment.
2. Build the control-plane foundation: users, organizations, memberships, repositories, roles, audit events.
3. Add a read-only browser backed by native Mercurial commands/libraries.
4. Implement the HTTPS protocol gateway with least-privilege authorization.
5. Implement the OpenSSH forced-command gateway.
6. Add post-push hooks, background jobs, webhooks, and observability.
7. Add code review only after cloning, pushing, permissions, and auditing are correct.

## Non-negotiable technical boundary

RevForge is a **control plane around native Mercurial repositories**. It must not reimplement Mercurial revlogs, bundles, repository locking, transaction semantics, or wire protocol framing. The product controls authorization, routing, metadata, UX, policy, operations, and integrations; Mercurial owns repository internals.

# RevForge Contributor and Codex Workflow Pack

## Files

- `CONTRIBUTING.md` — Git branches, commits, pull requests, reviews, conflicts, worktrees, and ownership for human contributors.
- `docs/CODEX_WORKFLOW.md` — how to run Codex safely in RevForge, including prompts, subagent roles, review loops, safety boundaries, and handoff format.
- `.github/pull_request_template.md` — a PR template aligned with the workflow.

## Installation

Copy each file into the matching location in the RevForge repository:

```text
RevForge/
├── CONTRIBUTING.md
├── docs/
│   └── CODEX_WORKFLOW.md
└── .github/
    └── pull_request_template.md
```

Then add the following short links to the repository-root `README.md`:

```markdown
## Contribution

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
Codex contributors must also follow [docs/CODEX_WORKFLOW.md](docs/CODEX_WORKFLOW.md).
```

## One team decision to make

Choose the required human approvals for protected `main`:

- Two contributors: require one approval from the other contributor.
- Three or more contributors: require one approval plus code-owner approval for security, Mercurial, and operations paths.
