# ADR 003: Organization and Repository Authorization

## Status

Accepted

## Context

RevForge needs durable authorization semantics before repository provisioning and Mercurial transport are added. The model must support tenant isolation, explicit ownership protections, and repository-level exceptions without scattering policy across route handlers.

## Decision

Phase 1 defines:

- organization roles: `owner`, `admin`, `member`;
- repository roles: `read`, `write`, `admin`;
- repository visibility: `public`, `internal`, `private`.

Policy rules:

- owners and admins inherit full administrative access to all repositories in their organization;
- members can read `internal` repositories and need explicit permissions for `private` repositories;
- public repository metadata is visible without authentication;
- explicit repository `admin` grants metadata and permission management for that repository only;
- the final organization owner cannot be removed or demoted.

Authorization checks live in service-layer policy helpers rather than being duplicated inside HTTP route handlers.

## Consequences

- Tenant isolation and visibility rules stay consistent between API endpoints.
- Repository metadata can ship before Mercurial provisioning.
- Future transport layers can consume the same policy model instead of reinventing access checks.
- Invitations, teams, PATs, and break-glass platform operations remain future decisions.
