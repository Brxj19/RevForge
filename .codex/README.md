# RevForge Codex Agents

Place this `.codex/` directory at the root of the RevForge repository.

## Included custom agents

| File | Spawn name | Use for |
|---|---|---|
| `agents/revforge-lead.toml` | `revforge_lead` | Planning and coordinated work |
| `agents/revforge-explorer.toml` | `revforge_explorer` | Read-only codebase investigation |
| `agents/revforge-mercurial.toml` | `revforge_mercurial` | Mercurial lifecycle, HTTP/SSH, hooks |
| `agents/revforge-backend.toml` | `revforge_backend` | APIs, DB, RBAC, jobs |
| `agents/revforge-frontend.toml` | `revforge_frontend` | React product surfaces and UX |
| `agents/revforge-security.toml` | `revforge_security` | Read-only adversarial review |
| `agents/revforge-qa.toml` | `revforge_qa` | Tests and release verification |
| `agents/revforge-operations.toml` | `revforge_operations` | Compose, proxy, backups, observability |

## Suggested prompts

```text
Spawn revforge_lead to break this feature into a safe implementation plan. Then spawn the necessary specialists in parallel, wait for their results, and consolidate the plan before making changes.
```

```text
Spawn revforge_explorer and revforge_security in parallel. Inspect the repository-sharing endpoint and report the actual authorization path, filesystem boundary, and concrete risks. Do not edit files.
```

```text
Spawn revforge_mercurial to implement repository creation and read-only changeset browsing. Then have revforge_qa add fixture-repository tests and revforge_security review the resulting diff.
```

## Notes

- Agent files are automatically discovered from `.codex/agents/`; they do not need to be declared in `.codex/config.toml`.
- Each agent TOML must have `name`, `description`, and `developer_instructions`.
- The `.codex/config.toml` file only sets project root markers and conservative concurrency defaults.
- Keep `AGENTS.md`, `DESIGN.md`, and `.agents/skills/` at the repository root as complementary project guidance.
