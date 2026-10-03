---
name: revforge-quality
description: Design tests, review diffs, and prepare release evidence for RevForge. Use for unit, integration, E2E, native Mercurial client compatibility, migration, performance smoke, regression, and release-readiness work.
---

# RevForge Quality and Release Skill

## Objective

Ensure features work as an integrated repository-hosting system, not merely as passing isolated unit tests.

## Test layers

| Layer | Purpose | Examples |
|---|---|---|
| Unit | Pure domain/policy logic | slug validation, role resolution, ref parsing, URL validation |
| API integration | FastAPI + PostgreSQL + auth | repository creation, memberships, token scope, audit records |
| Protocol integration | Real gateway + ephemeral repo | `hg clone`, `hg pull`, `hg push`, denied push |
| SSH integration | OpenSSH/forced-command behavior | authorized key, denied command, malformed original command |
| Worker integration | queue/event behavior | post-push indexing, retry, idempotency |
| E2E browser | user outcome and accessibility | create repository, clone panel, browse change, change permission |
| Security regression | known abuse patterns | traversal, cross-org ID, SSRF, command injection, XSS |
| Operations smoke | deploy/backup/restore | compose startup, migration, health checks, restore sample |

## Workflow

1. Translate the feature specification into observable acceptance criteria.
2. Build a risk-based test matrix: happy path, authorization denial, invalid input, concurrency/retry, failure recovery, user-visible state.
3. Prefer real dependencies in protocol and migration tests; test doubles are appropriate for narrow unit tests only.
4. Keep fixtures tiny, named, and disposable. Each test must own its repository/database namespace.
5. Verify failures provide useful diagnostics without leaking secrets.
6. Review changed tests for false confidence: assertions should check behavior, not implementation trivia.

## Mercurial compatibility minimum

For any protocol change, execute real commands against an isolated service:

```bash
hg init source
cd source
printf 'one\n' > README.md
hg add README.md
hg commit -m 'first changeset'
hg push "$REVFORGE_TEST_PUSH_URL"
hg clone "$REVFORGE_TEST_CLONE_URL" cloned
hg -R cloned verify
```

Add test scenarios for read-only users, unauthorized users, invalid token/key, archived repository, long path, binary file, and post-push worker retry as applicable.

## Review checklist

- Is the change small enough to understand and revert?
- Are domain invariants enforced in code and database where needed?
- Are errors handled without partial state corruption?
- Are migrations safe and tested?
- Does the diff add an audit event for sensitive changes?
- Is the frontend tested for loading/empty/error/denied state?
- Does the implementation conform to `AGENTS.md` and `DESIGN.md`?
- Has a change introduced unused dependency, dead code, unrelated refactor, or hidden scope expansion?

## Release evidence template

```text
Feature: <name>
Risk: low / medium / high

Acceptance criteria
- [x] ...

Automated evidence
- <command> — pass

Manual / native-client evidence
- <scenario> — pass

Migration / rollback
- <statement>

Security review
- <finding status>

Known limitations
- <list>
```
