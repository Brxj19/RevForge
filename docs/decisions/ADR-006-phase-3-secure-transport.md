# ADR 006: Phase 3 Secure Mercurial Transport

## Status

Proposed

## Context

RevForge Phase 2 already provides repository metadata, canonical storage, and read-only Mercurial browser routes. Phase 3 needs native `hg clone`, `hg pull`, and `hg push` support without turning the control plane into a custom protocol implementation.

## Decision

RevForge will add two transport credential types:

- personal access tokens for Mercurial HTTPS Basic authentication;
- registered SSH public keys for forced-command Mercurial SSH access.

The protocol gateways will:

- resolve organizations and repositories through trusted database records;
- authorize before any repository path is derived;
- use native Mercurial entrypoints for protocol handling;
- reject unknown or malformed transport commands by default;
- record audit events for credential lifecycle and protocol access.

The HTTP gateway will delegate to Mercurial's WSGI hgweb integration after authentication and authorization. The SSH gateway will accept only a narrow Mercurial forced-command shape and then exec the native Mercurial stdio server.

## Consequences

- Standard Mercurial clients remain compatible.
- Browser session cookies stay separate from native transport credentials.
- The transport layer gains a narrow, testable boundary for permission checks and audit events.
- Mercurial Python bindings become a required backend dependency for the HTTP gateway.
