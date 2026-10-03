---
name: revforge-operations
description: Build or review RevForge Docker Compose, reverse proxy, environment configuration, PostgreSQL and Redis setup, persistent repository storage, backups, restores, metrics, logs, health checks, Linux host hardening, and release runbooks. Use for deployment and operational reliability work.
---

# RevForge Operations Skill

## Objective

Make RevForge deployable, observable, recoverable, and safe to operate as a real source-control service.

## Baseline topology

```text
Internet / private network
        |
Reverse proxy with TLS and limits
        |
Web + API + hg-http-gateway
        |
PostgreSQL + Redis + persistent repository volume
        |
Worker + backup tooling + offsite encrypted backup target

OpenSSH -> forced-command ssh-gateway -> native Mercurial
```

## Operational invariants

1. Repository data, PostgreSQL data, and application configuration use durable volumes outside ephemeral containers.
2. Production services run as non-root users with least filesystem access.
3. Repository service account does not have an interactive login shell.
4. TLS terminates at a controlled edge; plain HTTP is redirected or unavailable outside trusted local development.
5. No deployment succeeds without health checks, migration plan, and backup verification.
6. Backups include both database metadata and repository storage. Either alone is insufficient.
7. Restoration is tested, documented, and time-bounded.

## Workflow

### 1. Define service contract

For every service specify:

- image/build source and pinned version;
- command and non-root user;
- required environment variables and secrets;
- mounted volumes;
- network exposure;
- health endpoint/check;
- dependencies and startup ordering;
- resource/timeout limits;
- logs and metrics destination.

### 2. Configuration and secrets

- Commit `.env.example`, never real secrets.
- Validate required environment variables at startup with actionable errors.
- Keep database URLs, token secrets, TLS credentials, backup credentials, and webhook signing keys out of logs and rendered config.
- Rotate secrets through documented procedures.

### 3. Storage and backup

Protect:

```text
A. PostgreSQL logical backup / point-in-time strategy
B. Repository storage snapshot or consistent archive
C. Configuration and encryption-key recovery material
D. Audit/event data retention needed for operation
```

- Encrypt offsite backups.
- Use retention policy suited to storage budget and recovery requirements.
- Run scheduled restore drills to a separate environment.
- Verify `hg verify` on a sampled restored repository.

### 4. Observability

Expose:

- liveness and readiness health;
- request rate, error rate, latency, active connections;
- protocol operation outcomes and durations;
- job queue depth, retry/failure counts;
- repository volume free space/inodes;
- PostgreSQL and Redis health;
- backup age and last restore-drill result.

Use structured logs with request IDs. Redact secrets at the logger boundary.

### 5. Release procedure

1. Confirm backup freshness and restore readiness.
2. Review migration impact and downtime/lock expectations.
3. Deploy to staging where available.
4. Run smoke tests: web login, API health, clone/pull/push, SSH auth, worker event, audit event.
5. Deploy production in a reversible order.
6. Monitor errors, latency, queue, disk, and auth failures.
7. Record deployment version, migration version, and rollback decision point.

## Required deliverables

- Compose/proxy/systemd changes;
- service/volume/network mapping;
- `.env.example` updates;
- backup and restore commands/runbook;
- health and smoke checks;
- operational risks and rollback guidance.
