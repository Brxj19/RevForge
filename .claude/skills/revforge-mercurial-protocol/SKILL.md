---
name: revforge-mercurial-protocol
description: Build or review RevForge Mercurial HTTP, SSH, hook, repository-read, and repository-write integrations. Use for hg clone/pull/push compatibility, hgweb/WSGI routing, forced-command SSH, repository paths, hooks, locking, and native client tests. Do not use for generic FastAPI or React-only tasks.
---

# RevForge Mercurial Protocol Skill

## Objective

Preserve native Mercurial behaviour while adding RevForge authorization, routing, auditability, and operational controls. RevForge owns the control plane; Mercurial owns revlogs, transactions, locks, bundles, and wire-protocol details.

## Required inputs

Before modifying code, identify:

1. Transport: browser/API, HTTPS Mercurial protocol, SSH Mercurial protocol, or hook/event path.
2. Repository identity and canonical storage path source.
3. Authenticated principal and required permission (`read`, `write`, `admin`).
4. Native Mercurial entrypoint to use.
5. Real client commands that will prove compatibility.
6. Expected audit events and post-operation jobs.

## Workflow

### 1. Map the native boundary

- Locate all subprocess or Mercurial Python library calls.
- Confirm the code does not parse wire-protocol messages or write `.hg` files directly.
- Define a narrow adapter API such as `RepositoryReader`, `HgHttpGateway`, `SshCommandGateway`, or `PostPushProcessor`.
- Pin the supported Mercurial version range and document any relied-on behavior.

### 2. Canonicalize repository resolution

- Receive organization/repository identifiers as application-level IDs or validated slugs.
- Resolve through the database, then construct the path from trusted server-side storage root + internal directory name.
- Resolve symlinks and assert the final location remains under the configured repository root.
- Reject raw filesystem paths, `..`, empty segments, encoded traversal, hidden-control characters, and ambiguous Unicode normalization.

### 3. Authenticate and authorize before Mercurial handoff

- Identify the principal.
- Check account status, organization membership, repository state, and permission.
- Determine minimum permission from operation type; default to deny when uncertain.
- Never call native Mercurial before the authorization decision succeeds.
- Record the operation result without leaking token/key material.

### 4. Use controlled process/library execution

When invoking `hg`:

- Use an argument list, never a shell string.
- Use a fixed executable path or trusted `PATH`.
- Set a minimal environment and a controlled `HGRCPATH` policy.
- Provide a timeout, output-size limit, working directory, and structured error conversion.
- Keep the repository path server-generated.
- Do not accept flags, aliases, config overrides, or hooks from the client request.

### 5. HTTPS gateway rules

- Keep protocol routing separate from normal JSON API routing.
- Do not invent a custom request format for normal Mercurial clients.
- Forward only the authenticated, authorized request to the native WSGI/hgweb integration.
- Enforce body size, request duration, connection limits, reverse-proxy headers, and rate limits at appropriate layers.
- Treat HTTP method, path, query, and content type as untrusted; validate all routing assumptions.

### 6. SSH forced-command rules

- OpenSSH accepts the key; the forced command controls execution.
- Parse `SSH_ORIGINAL_COMMAND` using a strict grammar/allowlist.
- Allow only expected Mercurial server-side commands and one canonical repository identifier format.
- Deny interactive shell, port forwarding, arbitrary commands, command chaining, environment injection, and repository paths.
- Map the key fingerprint to a RevForge credential and user before permission checks.
- Execute the native Mercurial SSH server command only after read/write authorization.

### 7. Push and hook rules

- Let successful native Mercurial completion determine push success.
- Persist a protocol/push audit event at the appropriate point with operation outcome.
- Enqueue indexing, webhook, notification, and metrics work asynchronously after a successful push.
- Do not permit arbitrary repository-provided shell hooks in MVP.
- Make post-push workers idempotent using an event ID or changeset/repository cursor.

## Permission matrix

| Operation | Minimum permission | Notes |
|---|---|---|
| Clone / pull / discovery | `read` | Hide existence for unauthorized callers where product policy requires. |
| Browse tree/history/diff | `read` | Read endpoints must still respect repository visibility and archive policy. |
| Push | `write` | Enforce protected bookmark/branch policies before native handoff when feasible. |
| Configure repository hooks/policy | `admin` | Config changes create audit events. |
| Global repair/maintenance | `platform_admin` + explicit procedure | Keep outside normal developer credentials. |

## Required tests

Use an ephemeral repository and a real `hg` client. Cover at least:

```bash
hg init client-a
cd client-a
printf 'hello\n' > README.md
hg add README.md
hg commit -m 'initial'
hg push <authorized-url>
hg clone <authorized-url> client-b
hg -R client-b log -T '{node}\n'
```

Also test:

- unauthenticated access;
- valid identity without organization membership;
- `read` identity attempting push;
- suspended user;
- archived repository;
- malformed repository identifier;
- path traversal attempt;
- malformed SSH original command;
- duplicate/retried post-push event;
- native lock/contention behavior where write operations overlap.

## Deliverables

Return:

1. architecture and entrypoint changes;
2. authorization decision points;
3. native client evidence;
4. security controls added;
5. tests run and results;
6. known compatibility limitations.
