---
name: revforge-security
description: Threat-model, review, or harden RevForge authentication, authorization, repository path handling, subprocess execution, Mercurial HTTP/SSH access, SSH keys, access tokens, webhooks, secrets, audit logging, network controls, and deployment configuration. Use for any security-sensitive or externally reachable change.
---

# RevForge Security Review Skill

## Objective

Find and reduce realistic attack paths before they become part of repository hosting, credential access, or production operations.

## Threat-model template

For each task, identify:

1. **Assets:** source code, repository history, credentials, SSH keys, tokens, user identities, audit records, server filesystem, backups.
2. **Actors:** anonymous internet user, authenticated developer, malicious organization admin, compromised CI account, internal attacker, service operator.
3. **Trust boundaries:** browser/API, HTTPS protocol gateway, SSH gateway, worker queue, database, repository storage, reverse proxy, external webhooks, backup target.
4. **Entry points:** HTTP path/query/body/headers, SSH key and original command, repository name/slug, config fields, webhook URLs, uploaded files, environment variables, task payloads.
5. **Abuse cases:** unauthorized read/write, privilege escalation, path traversal, command injection, SSRF, token leakage, cross-org confusion, log exfiltration, replay, denial of service, malicious content rendering, backup exposure.

## Security review checklist

### Authorization

- Is authorization centralized and applied before every sensitive action?
- Can a user cross organization boundaries by guessing IDs/slugs?
- Are role changes, repository archival, credential creation, and admin actions audited?
- Does “platform admin” access follow explicit, auditable policy?

### Filesystem and process execution

- Is every repository path server-derived and contained under configured root?
- Are symlinks resolved and validated?
- Are commands executed without `shell=True` or equivalent?
- Are environments controlled and user-controlled config/flags excluded?
- Do timeouts, output limits, and concurrency limits protect the host?

### HTTP and browser

- Are browser sessions protected against CSRF?
- Are cookies Secure, HttpOnly, and correctly SameSite scoped?
- Are CORS rules deliberate and minimal?
- Are rate limits applied to login, token, repository discovery, and expensive endpoints?
- Are user-provided text/file previews escaped or sanitized?

### SSH and tokens

- Are SSH keys normalized, fingerprinted, and restricted to forced commands?
- Is `SSH_ORIGINAL_COMMAND` parsed with a strict allowlist?
- Are personal access tokens stored as non-reversible values and shown once only?
- Are token scopes, expiry, last-used tracking, revocation, and audit events implemented?

### Webhooks and jobs

- Is SSRF mitigated for outbound URLs?
- Are payload signatures, retry caps, timeouts, DNS/IP checks, and egress policy applied?
- Are job payloads authorization-safe and idempotent?
- Can a queue message cause an arbitrary command or path access?

### Secrets and logs

- Are credentials absent from code, fixtures, exceptions, logs, URLs, traces, and analytics?
- Do error messages avoid leaking repository paths, SQL details, or sensitive configuration?
- Are backups encrypted and access-controlled?

## Severity guidance

| Severity | Meaning | Expected action |
|---|---|---|
| Critical | Allows broad unauthorized code/credential access or remote execution | Block merge/release immediately. |
| High | Meaningful privilege escalation, unauthorized repo write/read, token compromise, SSRF to sensitive targets | Fix before release. |
| Medium | Limited exposure, defense-in-depth gap, scoped information leak | Fix in current milestone or document accepted risk. |
| Low | Hardening, minor information exposure, maintainability concern | Track with clear owner. |

## Deliverables

Return a short threat model, findings with file/flow evidence, severity, concrete remediation, test suggestions, and residual risk. Do not report speculative vulnerabilities without explaining the prerequisite and exploit path.
