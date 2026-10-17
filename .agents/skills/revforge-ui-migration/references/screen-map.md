# Screen map — frontend-next ↔ backend ↔ audit

Legend — endpoints: ✅ exists · 🔁 exists, needs change · 🆕 new. Audit: 🔒 needs `revforge-security` review.
Prefixes: `/api/v1` is implied. `O = /organizations/{org}`, `R = O/repositories/{repo}`.
Prototype links are hash routes inside `docs/design/revforge-prototype.html` (open the file, then paste the hash).
Status column: update in the same PR (`todo` → `wip` → `done`).

## Contents
- Phase 0 — Foundation
- Phase 1 — Repository read path
- Phase 2 — History, changesets, refs
- Phase 3 — Pull requests and reviews
- Phase 4 — Organizations, settings, credentials, webhooks
- Phase 5 — Discovery, access, people, notifications
- Phase 6 — Forge admin
- Phase 7 — Public pages, docs, errors, cutover
- New endpoint contracts
- Backend-only audit items (no screen)
- Cutover checklist

---

## Phase 0 — Foundation
Scaffold (phase-0-setup.md), tokens, every `ui/` primitive + `/dev/ui` kit, icons, file icons, illustrations, shell (top bar, anon top bar, sidebar, pins UI with local fallback), command palette shell, auth provider, query client, MSW.

| Screen / piece | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| UI kit | `#/ui`, `#/illustrations` | `dev-ui` | — | U-items via primitives | done (`/dev/ui`, `/dev/illustrations`) |
| App shell, sidebar, pins | any page | `app/shell` | ✅ `GET /auth/me` · 🆕 `GET/PUT /me/pins` (API-GAP: pins — MSW + local fallback) | — | done (frontend; pins endpoint open) |
| Auth state & session | — | `app/auth` | ✅ `/auth/login` `/auth/logout` `/auth/csrf` `/auth/me` | F1, F2, F3 | done |
| Error envelope parsing | — | `lib/api/client` | 🔁 all errors carry `request_id` | I1 | done |

## Phase 1 — Repository read path
| Screen | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| Repo layout, header, clone menu, tabs | `#/r/sigma-reckitt` | `repo` | ✅ `GET R` · 🔁 `GET R/transport` (anonymous on PUBLIC → HTTPS only; no path hint for non-admins) | — | done |
| Overview (file table, README, about, recent) | `#/r/sigma-reckitt` | `repo` | ✅ `GET R/browse` · ✅ `GET R/changesets?limit=6` · 🔁 `GET R/browse` add `last_changeset` per entry · 🆕 `GET R/stats` (languages, contributors, size) | — (U4 is the dashboard table → Phase 5) | done |
| Revision rail + ref picker | Code page | `repo` | ✅ `GET R/refs` · 🔁 `GET R/changesets/{node}` resolve short hashes ≥ 6 hex | I11 | done |
| Code: explorer + file view + not-shown | `#/r/sigma-reckitt/code/main.cpp` | `code` | ✅ `GET R/browse?rev=&path=` · 🔁 file payload: `kind` (text/binary/image/font), `size`, `language`, `too_large` | F7, U3, U5 | done |
| Code viewer (CodeMirror) + blame | `…/main.cpp?view=blame` | `code` | 🔁 `GET R/blame` (+ `date`, `origin_line`, `summary`, `is_binary`, `is_too_large`) | — | done |
| Markdown / CSV / JSON previews | `…/README.md`, `…/bench/results.csv`, `…/config/presets.json` | `code` | 🆕 `GET R/raw?rev=&path=` (raw bytes, `Content-Disposition`, CSP `sandbox`) | F8 🔒 | done |
| Go to file (palette `~`) | ⌘K `~` | `palette` | ✅ `GET R/search/files` | — | done |
| Code search (palette `/`) | ⌘K `/add_edge` | `palette` | 🆕 `GET R/search/code?q=&rev=` (literal only) | 🔒 (regex/grep injection) | done |
| Repo states: provisioning / failed / archived | `#/r/infra-scripts`, `#/r/ml-experiments`, `#/r/legacy-billing` | `repo` | 🔁 `GET R` add `provisioning_error`, `provisioning_started_at` · ✅ `POST R/provision` | I36 | done |

## Phase 2 — History, changesets, refs
| Screen | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| History list + graph + detail pane | `#/r/sigma-reckitt/history` | `history` | 🔁 `GET R/changesets?branch=&author=&path=&q=&cursor=` server-side filters (escaped revsets), `insertions/deletions/files_changed` per row, `refs` per row | F4, F5, F6, U1, U2, I13 (push events completeness for activity) | todo |
| Commit hover card | hover a row | `history` | uses row data + ✅ `GET R/changesets/{node}` (body, files) | — | todo |
| Changeset page | `#/r/sigma-reckitt/c/0b486fec60de` | `changeset` | ✅ `GET R/changesets/{node}` · 🔁 `…/diff` return hunks + rename/binary flags | F7, I34 | todo |
| Branches & tags | `#/r/sigma-reckitt/refs` | `refs` | ✅ `GET R/refs` · 🔁 add `state` (open/closed/merged), `updated_at` | — | todo |

## Phase 3 — Pull requests and reviews
| Screen | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| PR list (repo) | `#/r/sigma-reckitt/pulls` | `pulls` | 🔁 `GET R/pull-requests?state=&q=&author=&cursor=` + counts per state | I32 | todo |
| Reviews inbox | `#/reviews` | `reviews` | 🆕 `GET /me/pull-requests?filter=` | — | todo |
| New PR | `#/r/sigma-reckitt/pulls/new` | `pulls` | 🆕 `GET R/compare?base=&head=` · 🔁 `POST R/pull-requests` pin full nodes | I8 🔒, I31 🔒, I32 | todo |
| PR conversation + timeline | `#/r/sigma-reckitt/pulls/7` | `pulls` | ✅ `GET R/pull-requests/{id}` · 🆕 `GET …/timeline` · ✅ `POST …/comments` | I33, I35 🔒, F9 🔒 | todo |
| Merge box + merge dialog | `#/r/sigma-reckitt/pulls/7` | `pulls` | 🆕 `GET …/merge-status` · ✅ `POST …/merge` | I31 🔒 | todo |
| Review dialog, reviewers | PR side panel | `pulls` | ✅ `POST …/reviews` · 🔁 `POST …/reviewers` validate user + read access | I9 🔒, I35 | todo |
| Files changed + inline threads | `#/r/sigma-reckitt/pulls/7/files` | `pulls` | 🔁 `GET …/diff` merge-base hunks · ✅ `POST …/comments` (file_path, line_number ≥ 1) · 🆕 `POST …/comments/{cid}/resolve` · 🆕 `PUT …/viewed` | I7 🔒, I34, I35 🔒, F9 🔒 | todo |
| Draft / closed / merged states | `#/r/sigma-reckitt/pulls/5`, `/4` | `pulls` | ✅ `PATCH …/{id}` (draft, title) · ✅ `POST …/close` | — | todo |

## Phase 4 — Organizations, settings, credentials, webhooks
| Screen | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| Org overview / members / general / danger | `#/org/members` | `org` | ✅ `GET O` · 🔁 `GET O/members?cursor=` · 🔁 `PATCH O/members/{id}` last-owner lock (row lock) · ✅ `DELETE O/members/{id}` | I27 🔒, I30 | todo |
| Invitations | `#/org/members` (pending card) | `org` | 🆕 `GET/POST O/invitations` · 🆕 `POST O/invitations/{id}/resend` · 🆕 `DELETE O/invitations/{id}` · 🆕 `POST /invitations/{token}/accept` | 🔒 | todo |
| New organization | `#/orgs/new` | `org` | ✅ `POST /organizations` · 🆕 `GET /organizations/check-slug?s=` | I30c, I39a | todo |
| New repository | `#/new` | `repos` | ✅ `POST O/repositories` · 🆕 `GET O/repositories/check-slug?s=` | I39a | todo |
| Repo settings: general (visibility, rename, default branch) | `#/r/sigma-reckitt/settings/general` | `repo-settings` | 🔁 `PATCH R` (PUBLIC needs org admin + high-severity audit; slug conflict → 409) | I29 🔒, I39 | todo |
| Repo settings: access | `…/settings/access` | `repo-settings` | ✅ `GET/PUT R/permissions` · ✅ `DELETE R/permissions/{user_id}` | I29 | todo |
| Repo settings: transport | `…/settings/transport` | `repo-settings` | ✅ `GET R/transport` · 🆕 `PATCH R/transport` (ssh/https/anonymous toggles) | 🔒 | todo |
| Webhooks list / create (secret once) / detail / deliveries | `…/settings/webhooks/1` | `repo-settings` | 🔁 `POST R/webhooks` return secret once · ✅ `GET …/deliveries` · 🆕 `POST …/deliveries/{id}/redeliver` · 🆕 `POST …/{id}/rotate-secret` · 🆕 `POST …/{id}/ping` | I5, I6 🔒 | todo |
| Danger zone (archive, transfer, delete) | `…/settings/danger` | `repo-settings` | 🔁 `DELETE R` org admins only, audit before delete | I37 🔒, I39c | todo |
| Your settings: profile / sessions / appearance | `#/settings/profile` | `settings` | ✅ `GET/DELETE /sessions` · 🆕 `PATCH /me` · 🆕 `GET/PUT /me/preferences` (accent, graph default, compact) | I24, I26 | todo |
| SSH keys (incl. restore) | `#/settings/ssh-keys` | `settings` | ✅ `GET/POST/DELETE /ssh-keys` | — (C11 done) | todo |
| Access tokens (org scope, expiry) | `#/settings/tokens` | `settings` | 🔁 `POST /tokens` validate org membership · 🔁 `GET /tokens` add `last_used_at`, `organization` | I12 🔒 | todo |
| Notification settings | `#/settings/notifications` | `settings` | 🆕 `GET/PUT /me/notification-settings` | — | todo |

## Phase 5 — Discovery, access, people, notifications
| Screen | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| Home | `#/` | `home` | ✅ `GET /me/contributions` · ✅ `GET /events` · 🆕 `GET /me/attention` | U4 | todo |
| Explore / search (signed in + anonymous) | `#/explore?q=graph` | `explore` | 🆕 `GET /search/repositories` · 🆕 `GET /search/organizations` | 🔒 (visibility filtering) | todo |
| Anonymous repo view | View as anonymous → public repo | `repo` | 🔁 private repo → **404** for anonymous (no existence leak) | 🔒 | todo |
| No access + request access | `#/r/payments-core` | `repo` | 🆕 `POST R/access-requests` · 🆕 `GET O/access-requests` · 🆕 `POST/DELETE …/{id}` | 🔒 | todo |
| People picker (invite / access / reviewers) | invite dialog | `people-picker` | 🆕 `GET /users/search?q=&scope=&org=&repo=` (signed-in only, rate-limited) | 🔒 enumeration | todo |
| Notifications bell | top bar | `notifications` | 🆕 `GET /me/notifications` · 🆕 `POST /me/notifications/read` | I33 | todo |
| Activity log | `#/activity` | `activity` | ✅ `GET /audit` · ✅ `GET O/activity` · 🔁 filters + CSV export | I30 | todo |
| Public profile | `#/u/brxj19` | `profile` | 🆕 `GET /users/{handle}` · 🆕 `GET /users/{handle}/contributions` | — | todo |

## Phase 6 — Forge admin
| Screen | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| Admin overview / system health | `#/admin` | `admin` | 🆕 `GET /admin/overview` · 🆕 `GET /admin/health` | I28 🔒, I14 | todo |
| Users (suspend, revoke sessions) | `#/admin/users` | `admin` | 🆕 `GET /admin/users` · 🆕 `POST /admin/users/{id}/suspend|reactivate|revoke-sessions` | I28 🔒 | todo |
| Organizations, repositories (retry / reset stuck) | `#/admin/repositories` | `admin` | 🆕 `GET /admin/organizations` · 🆕 `GET /admin/repositories` · 🆕 `POST /admin/repositories/{id}/reset-provisioning` | I36 | todo |
| Audit (severity filter) | `#/admin/audit` | `admin` | 🔁 `GET /audit?severity=&category=` | I30 | todo |
| Break-glass | `#/admin/breakglass` | `admin` + shell banner | 🆕 `POST /admin/break-glass` · 🆕 `DELETE /admin/break-glass/{id}` · 🆕 `GET /me/break-glass` | I28 🔒 | todo |

## Phase 7 — Public pages, docs, errors, cutover
| Screen | Prototype | Feature | Endpoints | Audit | Status |
|---|---|---|---|---|---|
| Sign in (bad password, locked, expired), suspended | `#/login?state=locked` | `auth` | 🔁 `POST /auth/login` 429 + `Retry-After`, neutral errors, `account_suspended` | I3 🔒, I23 🔒, I28 | todo |
| Register, verify, forgot/reset | `#/register` | `auth` | 🔁 `POST /auth/register` always 202 · 🆕 `POST /auth/verify-email` · 🆕 `POST /auth/password-reset` · 🆕 `POST /auth/password-reset/confirm` · 🆕 `GET /users/check-handle` | I25 🔒 | todo |
| Session expiry dialog | `#/map` → Session expired | `app/auth` | 🔁 `GET /auth/me` returns `reason: idle_timeout` | I24 🔒 | todo |
| Landing | `#/welcome` | `landing` | — | — | todo |
| Developer docs (15 pages) | `#/docs/webhooks` | `docs` | — (static Markdown) | — | todo |
| 404 / 429 / 500 | `#/error/500` | `errors` | 🔁 envelope with `request_id` | I1 | todo |

---

## New endpoint contracts

Shapes are the agreed contract for MSW handlers and backend implementation. Lists use `{ items: T[], next_cursor: string | null }`. Errors use `{ error: { code, message, request_id, details? } }`.

```ts
// GET /me/pins  → { items: { org: string; repo: string }[] }      PUT /me/pins  ← same (max 8, order kept)
// GET R/stats?rev → { languages: { name: string; percent: number; color: string }[]; contributors: number; contributors_truncated: boolean; size_bytes: number }
// Phase 1 changes (🔁):
// GET R → + provisioning_error: 'hg_init_failed'|'hg_verify_failed'|'storage_error'|'storage_conflict'|'provisioning_stale'|'cancelled'|null (enum code only); provisioning_started_at: string|null
// GET R/transport → anonymous allowed on PUBLIC repos: { https_clone_url } only (ssh fields null); authorized_keys_path_hint only for repo admins
// GET R/changesets?cursor&limit (1..50)
// GET R/browse (directory) entries: { name; path; kind: 'directory'|'file'; size: number|null;
//                last_changeset: { node; short_node; summary; author_name; date } | null }   (null past a 10k-file cap)
// GET R/browse (file) → + content_kind: 'text'|'binary'|'image'|'font'|'symlink'; size: number|null; language: string|null (friendly, e.g. "C++")
// GET R/blame → { revision; path; is_binary; is_too_large; lines: { line_number; origin_line; node; short_node; author_name; author_email; date; summary; path; content }[] }
// Revision resolution: bookmark → tag → branch (tip) → hex prefix ≥6. Unknown → 404 code 'revision_not_found'; ambiguous → 409 'revision_ambiguous' (no candidates).
// Not browsable → 409 code 'repository_not_ready'. Rate limited → 429 code 'rate_limited' + Retry-After.
// GET R/raw?rev&path → bytes; Content-Type from server allowlist (text → text/plain; charset=utf-8, else application/octet-stream; never html/svg/xml);
//     Content-Disposition: attachment; filename*=UTF-8''… (inline only png/jpeg/gif/webp); X-Content-Type-Options: nosniff;
//     Content-Security-Policy: sandbox; default-src 'none'; Cross-Origin-Resource-Policy: same-origin; Cache-Control: private, no-store. Directory → 404, > max_raw_bytes → 413
// GET R/search/code?q&rev&limit → { items: { path: string; line: number; text: string; ranges: [number, number][] }[]; truncated: boolean }
//     literal, case-insensitive; q 2..200 chars, no NUL/CR/LF (else 422); ≤100 matches, 300-char snippets; skips binary/symlink/>1MB
// GET R/compare?base&head → { base_node: string; head_node: string; merge_base: string; changesets: ChangesetSummary[];
//                            files: DiffFileSummary[]; conflicts: boolean; identical: boolean }
// GET /me/pull-requests?filter=review_requested|authored|involved|open|closed&cursor → list of PullRequestSummary (+ repository { org, repo })
// GET …/pull-requests/{id}/timeline → { items: ( {type:'opened'|'review_requested'|'review'|'comment'|'push'|'merged'|'closed'|'reopened'|'ready_for_review'|'converted_to_draft',
//                                       actor: UserRef; at: string; ...payload} )[] }
// GET …/pull-requests/{id}/merge-status → { mergeable: boolean; checks: { id: 'no_changes_requested'|'required_reviewers'|'min_approvals'|'no_conflicts'|'not_draft'|'source_unchanged';
//                                         ok: boolean; pending?: boolean; message: string; detail?: string }[] }
// POST …/comments/{cid}/resolve ← { resolved: boolean } → Comment        PUT …/viewed ← { path: string; viewed: boolean }
// GET/POST O/invitations  POST ← { invitees: ({ user_id: string } | { email: string })[]; role: 'member'|'admin'|'owner' } → { items: Invitation[] }
// POST /invitations/{token}/accept → { organization: OrgRef; role }
// GET /organizations/check-slug?s= , GET O/repositories/check-slug?s= , GET /users/check-handle?h=
//     → { available: boolean; reason?: 'taken'|'reserved'|'invalid' }
// PATCH R/transport ← { ssh?: boolean; https?: boolean; anonymous_clone?: boolean }
// POST …/webhooks → { webhook: Webhook; secret: string }   (secret only in this response)  POST …/{id}/rotate-secret → { secret }
// POST …/deliveries/{id}/redeliver → Delivery        POST …/{id}/ping → Delivery
// PATCH /me ← { display_name?, email?, author_aliases?: string[] }    GET/PUT /me/preferences → { accent: 'default'|'tech'|'professional'|'luxury'; graph_default: boolean; compact: boolean; reduce_motion: boolean }
// GET/PUT /me/notification-settings → { [type: string]: { in_app: boolean; email: boolean; locked?: boolean } }
// GET /me/attention → { items: { kind: 'webhook_failing'|'provisioning'|'review_requested'|'changes_requested'; title: string; detail: string; href: string }[] }
// GET /search/repositories?q&lang&org&visibility&sort&cursor → { items: RepoSearchHit[]; facets: { language: {value,count}[]; organization: {value,count}[]; visibility: {value,count}[] }; next_cursor }
//     anonymous: public only; signed in: public + internal of member orgs + private with grant
// GET /search/organizations?q → { items: OrgRef[] }
// POST R/access-requests ← { role: 'read'|'write'; message?: string } → AccessRequest;  GET O/access-requests;  POST O/access-requests/{id}/approve|deny;  DELETE R/access-requests/{id}
// GET /users/search?q&scope=org|repo|reviewer&org&repo&limit → { items: { user: UserRef; eligible: boolean; status: 'member'|'pending'|'not_member'|'granted'|'author'|'no_access'; label: string }[] }
//     signed-in only, min 2 chars, rate limited, never returns emails of users outside the caller's orgs unless exact email match
// GET /me/notifications?unread&cursor → { items: Notification[]; unread_count: number }   POST /me/notifications/read ← { ids?: string[] } (all if omitted)
// GET /users/{handle} → PublicUser   GET /users/{handle}/contributions → same shape as /me/contributions
// GET /admin/overview → { users, suspended, organizations, repositories, failed_provisioning, storage_bytes, spool_backlog, failed_logins_24h, paused_accounts }
// GET /admin/health → { components: { name, status: 'healthy'|'degraded'|'down', detail }[] }
// POST /admin/users/{id}/suspend ← { reason: string }  /reactivate  /revoke-sessions
// POST /admin/break-glass ← { org, repo, reason, minutes: 15|60|240 } → { id, expires_at }   GET /me/break-glass → active session | null
```

## Backend-only audit items (no screen; schedule alongside phases)
I2, I4, I10, I14, I15, I16, I17, I18, I19, I20, I21, I22, I26, I38 — transport, hardening, packaging and worker robustness. Assign to `revforge-backend` / `revforge-operations` / `revforge-mercurial`; 🔒 review for I2, I4, I10, I15–I22, I26, I38. Good pairings: I14 with Phase 6 system health; I13/I15 with Phase 2 activity; I38 before Phase 1 (deterministic repo format for blame/diff tests).

## Cutover checklist
- [ ] Every row above is `done`; `grep -r "API-GAP" frontend-next/src/mocks` is empty.
- [ ] Playwright smoke (testing.md) green against the real stack.
- [ ] F1–F9 and U1–U5 ticked in AUDIT-2026-10.md with tests in frontend-next.
- [ ] Legacy URL redirects verified (`/organizations/:org/repositories/:repo/*`).
- [ ] Lighthouse a11y ≥ 95 on Home, Code, History, PR detail; manual keyboard pass.
- [ ] `git rm -r frontend && git mv frontend-next frontend`; Makefile, compose, CI, `.claude/rules/frontend.md` paths updated in the same PR.
- [ ] Remove Tailwind and React deps from the root tooling; delete `docs/design/archive/` references from agent files.
