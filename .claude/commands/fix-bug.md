---
description: Fix one RevForge bug test-first, then verify and review it
argument-hint: "<bug description or audit finding>"
---

Fix this RevForge bug: $ARGUMENTS

Workflow:
1. Locate: read the relevant code (delegate to `revforge-explorer` if more than ~3 files are involved). State the root cause in 2-3 sentences with file:symbol references.
2. Plan: list files to change, the regression test to add, and any API/migration impact. If the change touches auth, sessions, permissions, the hg gateways, SSH, webhooks, or migrations, show me the plan and wait for approval.
3. Test first: write a test that reproduces the bug and run it to confirm it FAILS.
4. Fix: make the minimal change that respects AGENTS.md invariants. No unrelated refactors or formatting churn.
5. Verify: run the new test (must pass), then the relevant package's lint, typecheck, and test suite.
6. Review: for security-sensitive changes, delegate the diff to `revforge-security`; otherwise to `revforge-qa`. Fix confirmed issues.
7. Report using the AGENTS.md completion template. Do not commit unless I ask.
