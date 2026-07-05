# ADR 005: Controlled Mercurial CLI Adapter

## Status

Accepted

## Context

RevForge must provision and inspect real Mercurial repositories without reimplementing Mercurial internals. The integration must also protect the host from unsafe command construction, uncontrolled configuration, and unbounded output.

## Decision

RevForge Phase 2 uses the official `hg` executable through a dedicated command runner and read/provisioning services.

The adapter:

- executes argv arrays only;
- never uses a shell;
- resolves a configured `hg` executable path;
- runs with a controlled environment and stable working directory;
- enforces timeout and output caps;
- exposes only dedicated operations such as init, history, diff, browse, and refs;
- maps Mercurial failures to stable application-level errors.

User input is validated before command execution:

- revisions must be a full node ID or an approved branch, tag, or bookmark;
- repository paths must be safe repository-relative POSIX paths;
- generic revsets and raw flag injection are not supported.

## Consequences

- RevForge reuses Mercurial's real storage and diff behavior;
- the backend keeps a narrow, testable trust boundary around command execution;
- clone, pull, push, SSH, and hook orchestration remain separate Phase 3 concerns.
