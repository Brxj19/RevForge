---
name: revforge-backend
description: Implement or review RevForge FastAPI control-plane features: users, organizations, teams, repository metadata, RBAC, personal access tokens, audit events, webhooks, workers, PostgreSQL schema, migrations, and API contracts. Use for backend/domain work; not for Mercurial wire-protocol implementation.
---

# RevForge Backend Platform Skill

## Objective

Deliver secure, testable control-plane features with explicit domain rules and stable API contracts.

## Design rules

- Treat PostgreSQL as the source of truth for product metadata, roles, audit events, and credentials; Mercurial remains the source of truth for repository history.
- Enforce authorization in domain/service policy code, not only in route handlers.
- Use database constraints for invariants that must survive concurrent requests.
- Keep route handlers thin; put behavior in services/use cases.
- Make state changes auditable and idempotent where retries are possible.

## Workflow

### 1. Define the contract first

Write down:

- actor;
- resource;
- desired state transition;
- permission required;
- request/response schema;
- validation rules;
- failure cases and HTTP status semantics;
- audit event;
- whether background work is required.

### 2. Model data defensively

- Use UUID/ULID identifiers internally; use validated slugs only for human-readable URLs.
- Add `created_at`, `updated_at`, and actor fields where relevant.
- Use unique constraints for organization/repository slug scope, membership uniqueness, credential fingerprints, and idempotency keys.
- Soft-delete/archival requires explicit lifecycle fields; do not overload `deleted_at` with all concepts.
- Add indexes guided by query paths, especially organization/repository listings, audit filters, token/key lookup, and job queues.

### 3. Migrations

- Generate a focused migration with a descriptive name.
- Review generated DDL; do not blindly accept it.
- Consider lock duration and backfill strategy for non-null columns on live data.
- Add downgrade only when it is honest and safe; otherwise document forward-only recovery.
- Test migration from an empty database and, when possible, from representative prior schema.

### 4. Authorization

- Load the current principal once through an authentication dependency.
- Use a central policy service like `require_repo_permission(principal, repo, action)`.
- Test all denial states, not only happy paths.
- Avoid information leaks: do not return different detail that reveals private repository existence unless the product explicitly permits it.

### 5. Audit and events

For each state change, emit a structured event:

```text
id, occurred_at, actor_type, actor_id, action, resource_type, resource_id,
organization_id, repository_id, outcome, request_id, source_ip, metadata
```

Metadata must be intentionally allowlisted. Never store raw credentials, authorization headers, secrets, or full sensitive payloads.

### 6. API quality

- Version APIs only when breaking behavior requires it; do not add versioning theater.
- Use typed request/response schemas.
- Paginate list endpoints with stable cursor behavior.
- Return machine-usable error codes plus human-readable messages.
- Include request/trace ID in error responses and logs.

## Required test matrix

For any protected endpoint, test:

| Case | Expected result |
|---|---|
| unauthenticated | 401 or deliberately opaque 404 |
| authenticated but no membership | 403 or opaque 404 by policy |
| read role | allows read only |
| write role | allows permitted mutation only |
| admin role | allows repository administration |
| suspended/deactivated principal | denied |
| archived repository | behavior matches lifecycle policy |
| invalid input | 422/400 without partial writes |
| repeated request | idempotent or clear conflict behavior |

## Deliverables

- domain and API contract;
- migration(s) and schema notes;
- authorization decisions;
- audit/event behavior;
- tests and validation commands;
- rollback/recovery notes for data changes.
