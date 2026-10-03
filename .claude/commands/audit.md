---
description: Read-only bug and security audit of a RevForge area using explorer + security subagents
argument-hint: "<area, e.g. pull requests | webhooks | http gateway | history UI>"
---

Audit this area of RevForge for critical bugs: $ARGUMENTS

Workflow (read-only — do not edit files):
1. In parallel, delegate to:
   - `revforge-explorer`: map the execution path, files, symbols, tests, and contracts for the area.
   - `revforge-security`: threat-model the area (authz/IDOR, injection, SSRF, secrets, DoS).
   - `revforge-mercurial` as a reviewer ONLY if the area touches hg, the HTTP/SSH gateways, or hooks (tell it not to edit).
2. Verify each reported finding yourself by reading the code. Drop anything you cannot confirm.
3. Produce a ranked list: severity | file:symbol | what breaks | how to reproduce | proposed fix | regression test to add.
4. Finish with the 3 fixes you recommend doing first and ask which to start with.
