import type { CalloutTone } from "~/ui/Callout";

export type InlineSpan =
  | string
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string };

export type DocBlock =
  | { kind: "p"; content: readonly InlineSpan[] }
  | { kind: "h2"; id: string; text: string }
  | { kind: "code"; code: string; label?: string }
  | {
      kind: "codeTabs";
      id: string;
      tabs: readonly { id: string; label: string; code: string }[];
    }
  | { kind: "callout"; tone: CalloutTone; title?: string; text: string }
  | {
      kind: "table";
      caption: string;
      headers?: readonly string[];
      rows: readonly (readonly { text: string; mono?: boolean; center?: boolean; muted?: boolean }[])[];
    }
  | {
      kind: "endpoints";
      items: readonly { method: string; path: string }[];
    };

export interface DocPage {
  slug: string;
  group: string;
  title: string;
  blocks: readonly DocBlock[];
}

export interface DocGroup {
  title: string;
  pages: readonly DocPage[];
}

const code = (text: string): InlineSpan => ({ kind: "code", text });
const strong = (text: string): InlineSpan => ({ kind: "strong", text });

export const DOC_GROUPS: readonly DocGroup[] = [
  {
    title: "Getting started",
    pages: [
      {
        slug: "intro",
        group: "Getting started",
        title: "Introduction",
        blocks: [
          {
            kind: "p",
            content: [
              "RevForge hosts Mercurial repositories on your own servers. It gives you a web interface for code and history, pull requests with enforced review rules, SSH and HTTPS transport, webhooks, and a complete audit log.",
            ],
          },
          { kind: "h2", id: "what-youll-need", text: "What you’ll need" },
          {
            kind: "p",
            content: [
              "A Linux host with Docker, a DNS name, and port 22 or another port for SSH.",
            ],
          },
          { kind: "h2", id: "concepts", text: "Concepts" },
          {
            kind: "p",
            content: [
              strong("Organizations"),
              " own repositories and have members with roles. ",
              strong("Repositories"),
              " are public, internal (any organization member) or private. ",
              strong("Pull requests"),
              " propose merging one branch into another.",
            ],
          },
        ],
      },
      {
        slug: "quickstart",
        group: "Getting started",
        title: "Quick start (self-host)",
        blocks: [
          {
            kind: "p",
            content: ["Bring up a complete forge with Docker Compose."],
          },
          {
            kind: "h2",
            id: "download-and-configure",
            text: "1. Download and configure",
          },
          {
            kind: "code",
            code: "curl -O https://revforge.dev/compose.yml\ncp .env.example .env",
            label: "Copy download commands",
          },
          {
            kind: "p",
            content: [
              "Set these in ",
              code(".env"),
              " before exposing RevForge in production.",
            ],
          },
          {
            kind: "code",
            code: [
              "REVFORGE_ENVIRONMENT=production",
              "REVFORGE_SESSION_SECRET_KEY=<64 hex chars>",
              "REVFORGE_TRANSPORT_TOKEN_SECRET=<64 hex chars>",
              "REVFORGE_SESSION_COOKIE_SECURE=true",
              "REVFORGE_PUBLIC_BASE_URL=https://forge.example.com",
            ].join("\n"),
            label: "Copy environment settings",
          },
          { kind: "h2", id: "start", text: "2. Start" },
          {
            kind: "code",
            code: "docker compose up -d\ndocker compose exec api revforge create-admin you@example.com",
            label: "Copy start commands",
          },
          {
            kind: "callout",
            tone: "info",
            text: "The first account you create is a platform admin. Keep it for administration, not daily work.",
          },
          { kind: "h2", id: "check-health", text: "3. Check it’s healthy" },
          {
            kind: "code",
            code: "curl https://forge.example.com/api/v1/health",
            label: "Copy health check command",
          },
        ],
      },
      {
        slug: "clone",
        group: "Getting started",
        title: "Clone and push",
        blocks: [
          { kind: "h2", id: "over-ssh", text: "Over SSH" },
          {
            kind: "p",
            content: ["Add your public key under Your settings, then:"],
          },
          {
            kind: "code",
            code: "hg clone ssh://hg@forge.example.com/sigma/sigma-reckitt",
            label: "Copy SSH clone command",
          },
          { kind: "h2", id: "over-https", text: "Over HTTPS" },
          {
            kind: "p",
            content: [
              "Create an access token and use it as the password.",
            ],
          },
          {
            kind: "code",
            code: "hg clone https://forge.example.com/hg/sigma/sigma-reckitt",
            label: "Copy HTTPS clone command",
          },
          {
            kind: "p",
            content: [
              "Save it in ",
              code("~/.hgrc"),
              " so you aren’t asked every time:",
            ],
          },
          {
            kind: "code",
            code: [
              "[auth]",
              "forge.prefix = https://forge.example.com",
              "forge.username = you@example.com",
              "forge.password = rf_pat_…",
            ].join("\n"),
            label: "Copy hgrc auth block",
          },
          { kind: "h2", id: "pushing-branch", text: "Pushing a new branch" },
          {
            kind: "code",
            code: "hg push --new-branch",
            label: "Copy push command",
          },
        ],
      },
    ],
  },
  {
    title: "Working with hg",
    pages: [
      {
        slug: "ssh",
        group: "Working with hg",
        title: "SSH keys",
        blocks: [
          {
            kind: "p",
            content: [
              "Generate an ed25519 key if you don’t have one, then paste the ",
              strong("public"),
              " key into Your settings › SSH keys.",
            ],
          },
          {
            kind: "code",
            code: 'ssh-keygen -t ed25519 -C "you@example.com"\ncat ~/.ssh/id_ed25519.pub',
            label: "Copy keygen commands",
          },
          {
            kind: "h2",
            id: "re-adding-key",
            text: "Re-adding a removed key",
          },
          {
            kind: "p",
            content: [
              "Adding a key you removed earlier restores it rather than failing.",
            ],
          },
          { kind: "h2", id: "host-fingerprint", text: "Host fingerprint" },
          {
            kind: "p",
            content: [
              "Check it on first connect: ",
              code("SHA256:q3f…9Lx"),
              ".",
            ],
          },
        ],
      },
      {
        slug: "tokens",
        group: "Working with hg",
        title: "Access tokens",
        blocks: [
          {
            kind: "p",
            content: [
              "Tokens authenticate HTTPS clone, pull and push. Each token is limited to one organization and expires.",
            ],
          },
          {
            kind: "table",
            caption: "Access token scopes",
            headers: ["Scope", "Allows"],
            rows: [
              [{ text: "Read" }, { text: "clone, pull" }],
              [{ text: "Read and write" }, { text: "clone, pull, push" }],
            ],
          },
          {
            kind: "callout",
            tone: "warn",
            text: "The token is shown once. Store it in a password manager or your CI secrets.",
          },
        ],
      },
      {
        slug: "refs",
        group: "Working with hg",
        title: "Branches, bookmarks and tags",
        blocks: [
          {
            kind: "p",
            content: [
              strong("Named branches"),
              " are permanent: every changeset records its branch. ",
              strong("Bookmarks"),
              " are movable pointers, like lightweight branches. ",
              strong("Tags"),
              " pin a name to one changeset.",
            ],
          },
          {
            kind: "code",
            code: "hg branch feature/graph\nhg bookmark review/graph-api\nhg tag v1.0",
            label: "Copy ref commands",
          },
        ],
      },
      {
        slug: "graph",
        group: "Working with hg",
        title: "Reading the graph",
        blocks: [
          {
            kind: "p",
            content: [
              "Each lane is a line of development. The first-parent line of the default branch is always the leftmost lane. A second head on the same branch gets its own lane. Lanes are reused after branches merge.",
            ],
          },
          {
            kind: "p",
            content: [
              "Hollow nodes are merges. Hover any row to see the full message, stats and refs.",
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Collaboration",
    pages: [
      {
        slug: "pulls",
        group: "Collaboration",
        title: "Pull requests and reviews",
        blocks: [
          {
            kind: "p",
            content: [
              "A pull request proposes merging a source branch into a target branch. The source revision is pinned when it’s opened.",
            ],
          },
          { kind: "h2", id: "merge-requirements", text: "Merge requirements" },
          {
            kind: "table",
            caption: "Pull request merge requirements",
            headers: ["Rule", "Behaviour"],
            rows: [
              [
                { text: "No outstanding change requests" },
                {
                  text: "A reviewer who requested changes must approve or dismiss",
                },
              ],
              [
                { text: "Required reviewers approved" },
                { text: "Each required reviewer’s latest review is an approval" },
              ],
              [
                { text: "Minimum approvals" },
                {
                  text: "Configurable per repository; the author’s own approval never counts",
                },
              ],
              [
                { text: "Revision unchanged" },
                {
                  text: "If the source moved after approval, a fresh review is needed",
                },
              ],
            ],
          },
          { kind: "h2", id: "how-merging-works", text: "How merging works" },
          {
            kind: "p",
            content: [
              "RevForge updates to the target head, merges the source, commits, and pushes to the canonical repository, all under Mercurial’s lock. Conflicts stop the merge and are reported.",
            ],
          },
        ],
      },
      {
        slug: "webhooks",
        group: "Collaboration",
        title: "Webhooks",
        blocks: [
          {
            kind: "p",
            content: [
              "Webhooks send a signed ",
              code("POST"),
              " for repository events. Only 2xx responses count as delivered; others are retried for 24 hours.",
            ],
          },
          { kind: "h2", id: "events", text: "Events" },
          {
            kind: "p",
            content: [
              code("push"),
              ", ",
              code("tag"),
              ", ",
              code("bookmark"),
              ", ",
              code("pull_request"),
              ", ",
              code("ping"),
            ],
          },
          { kind: "h2", id: "payload", text: "Payload" },
          {
            kind: "code",
            code: [
              "{",
              '  "event": "push",',
              '  "repository": "sigma/sigma-reckitt",',
              '  "pusher": "brxj19",',
              '  "changesets": ["9f2a1c4e7b30…", "8e1b0d3f6a21…"],',
              '  "branch": "default"',
              "}",
            ].join("\n"),
            label: "Copy webhook payload",
          },
          {
            kind: "h2",
            id: "verifying-signature",
            text: "Verifying the signature",
          },
          {
            kind: "codeTabs",
            id: "webhook-hmac",
            tabs: [
              {
                id: "python",
                label: "Python",
                code: [
                  "import hmac, hashlib",
                  "",
                  "def verify(secret: bytes, body: bytes, header: str) -> bool:",
                  "    mac = hmac.new(secret, body, hashlib.sha256).hexdigest()",
                  '    return hmac.compare_digest(f"sha256={mac}", header)',
                ].join("\n"),
              },
              {
                id: "node",
                label: "Node",
                code: [
                  'import crypto from "node:crypto";',
                  "",
                  "export function verify(secret, rawBody, header) {",
                  '  const mac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");',
                  "  const expected = Buffer.from(`sha256=${mac}`);",
                  "  const received = Buffer.from(header);",
                  "  return expected.length === received.length && crypto.timingSafeEqual(expected, received);",
                  "}",
                ].join("\n"),
              },
              {
                id: "go",
                label: "Go",
                code: [
                  "package webhook",
                  "",
                  'import ("crypto/hmac"; "crypto/sha256"; "encoding/hex")',
                  "",
                  "func Verify(secret, body []byte, header string) bool {",
                  "    mac := hmac.New(sha256.New, secret)",
                  "    mac.Write(body)",
                  '    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))',
                  "    return hmac.Equal([]byte(expected), []byte(header))",
                  "}",
                ].join("\n"),
              },
            ],
          },
          {
            kind: "callout",
            tone: "info",
            text: "Hooks to private, loopback or link-local addresses are rejected, including after DNS resolution.",
          },
        ],
      },
    ],
  },
  {
    title: "Administration",
    pages: [
      {
        slug: "roles",
        group: "Administration",
        title: "Roles and permissions",
        blocks: [
          {
            kind: "table",
            caption: "Permissions by role",
            headers: [
              "Action",
              "Read",
              "Write",
              "Repo admin",
              "Org admin",
              "Owner",
            ],
            rows: [
              [
                { text: "Browse and clone" },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
              ],
              [
                { text: "Push" },
                { text: "—", center: true, muted: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
              ],
              [
                { text: "Approve pull requests" },
                { text: "—", center: true, muted: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
              ],
              [
                { text: "Repository settings and webhooks" },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
              ],
              [
                { text: "Make a repository public" },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
              ],
              [
                { text: "Delete a repository" },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
              ],
              [
                { text: "Manage members" },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "✓", center: true },
                { text: "✓", center: true },
              ],
              [
                { text: "Add or remove owners" },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "—", center: true, muted: true },
                { text: "✓", center: true },
              ],
            ],
          },
          {
            kind: "p",
            content: ["An organization always keeps at least one owner."],
          },
        ],
      },
      {
        slug: "security",
        group: "Administration",
        title: "Security and break-glass",
        blocks: [
          {
            kind: "p",
            content: [
              "RevForge enforces deny-by-default access controls across web sessions, personal access tokens, SSH keys, and webhooks.",
            ],
          },
          { kind: "h2", id: "idle-sessions", text: "Idle session expiry" },
          {
            kind: "p",
            content: [
              "Browser sessions expire automatically after ",
              code("REVFORGE_SESSION_IDLE_MINUTES"),
              " (default 30 minutes) without activity. When a session times out mid-work, the re-authentication dialog lets you sign back in without losing the page.",
            ],
          },
          { kind: "h2", id: "login-lockout", text: "Sign-in rate limits and lockout" },
          {
            kind: "p",
            content: [
              "Repeated failed sign-in attempts trigger a temporary per-account and per-IP pause returning ",
              code("429"),
              " with a ",
              code("Retry-After"),
              " header. Responses stay neutral so attackers cannot enumerate registered emails.",
            ],
          },
          { kind: "h2", id: "audit-severity", text: "Immutable audit log" },
          {
            kind: "p",
            content: [
              "Permission changes, repository visibility changes, account suspensions, lockouts, and administrative actions are recorded as immutable audit events. Sensitive actions are tagged ",
              strong("high severity"),
              " so platform admins can filter and export them.",
            ],
          },
          { kind: "h2", id: "break-glass", text: "Read-only break-glass access" },
          {
            kind: "p",
            content: [
              "Platform admins do not have implicit access to private repositories. During an incident, an admin can start a time-limited, read-only break-glass session with a mandatory ticket or reason. Organization owners are notified and every access is recorded at high severity.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            text: "Break-glass sessions never grant write, merge, or settings permissions, and end automatically when the window expires.",
          },
        ],
      },
      {
        slug: "config",
        group: "Administration",
        title: "Configuration reference",
        blocks: [
          {
            kind: "table",
            caption: "Environment variables",
            headers: ["Variable", "Default", "Notes"],
            rows: [
              [
                { text: "REVFORGE_ENVIRONMENT", mono: true },
                { text: "development", mono: true },
                { text: "production enables strict checks", muted: true },
              ],
              [
                { text: "REVFORGE_SESSION_SECRET_KEY", mono: true },
                { text: "—", mono: true },
                { text: "required in production", muted: true },
              ],
              [
                { text: "REVFORGE_TRANSPORT_TOKEN_SECRET", mono: true },
                { text: "—", mono: true },
                { text: "required in production", muted: true },
              ],
              [
                { text: "REVFORGE_SESSION_COOKIE_SECURE", mono: true },
                { text: "false", mono: true },
                { text: "must be true in production", muted: true },
              ],
              [
                { text: "REVFORGE_SESSION_IDLE_MINUTES", mono: true },
                { text: "30", mono: true },
                { text: "sign out after inactivity", muted: true },
              ],
              [
                { text: "REVFORGE_AUTH_LOGIN_IP_MAX_FAILURES", mono: true },
                { text: "20", mono: true },
                { text: "per IP per 15 min (account locks at 5)", muted: true },
              ],
              [
                { text: "REVFORGE_HG_EXECUTABLE", mono: true },
                { text: "hg", mono: true },
                { text: "pin one Mercurial build", muted: true },
              ],
              [
                { text: "REVFORGE_TRUSTED_PROXY_CIDRS", mono: true },
                { text: "—", mono: true },
                { text: "trusted proxy CIDRs for X-Forwarded-For", muted: true },
              ],
            ],
          },
        ],
      },
      {
        slug: "backups",
        group: "Administration",
        title: "Backups and upgrades",
        blocks: [
          {
            kind: "p",
            content: [
              "Back up the database and the repository volume together.",
            ],
          },
          {
            kind: "code",
            code: "docker compose exec db pg_dump -Fc revforge > revforge.dump\ntar czf repos.tgz /data/repositories",
            label: "Copy backup commands",
          },
          { kind: "h2", id: "upgrading", text: "Upgrading" },
          {
            kind: "code",
            code: "docker compose pull && docker compose up -d\ndocker compose exec api revforge migrate",
            label: "Copy upgrade commands",
          },
        ],
      },
    ],
  },
  {
    title: "Reference",
    pages: [
      {
        slug: "api",
        group: "Reference",
        title: "REST API",
        blocks: [
          {
            kind: "p",
            content: [
              "All endpoints live under ",
              code("/api/v1"),
              ". Authenticate with a session cookie and CSRF token, or a personal access token.",
            ],
          },
          {
            kind: "code",
            code: 'curl -H "Authorization: Bearer rf_pat_…" \\\n  https://forge.example.com/api/v1/repositories',
            label: "Copy curl example",
          },
          { kind: "h2", id: "errors", text: "Errors" },
          {
            kind: "p",
            content: [
              "Every error uses the same envelope, including unknown routes.",
            ],
          },
          {
            kind: "code",
            code: [
              "{",
              '  "error": {',
              '    "code": "not_found",',
              '    "message": "Repository not found.",',
              '    "request_id": "req_01JB8Q2V9XK3"',
              "  }",
              "}",
            ].join("\n"),
            label: "Copy error envelope example",
          },
          { kind: "h2", id: "rate-limits", text: "Rate limits" },
          {
            kind: "p",
            content: [
              "Sign-in and token use are limited per account and per IP. Over the limit you get ",
              code("429"),
              " with ",
              code("Retry-After"),
              ".",
            ],
          },
          { kind: "h2", id: "endpoints", text: "Endpoints" },
          {
            kind: "endpoints",
            items: [
              { method: "GET", path: "/api/v1/health" },
              { method: "GET", path: "/api/v1/auth/me" },
              { method: "POST", path: "/api/v1/auth/login" },
              { method: "POST", path: "/api/v1/auth/register" },
              { method: "GET", path: "/api/v1/repositories/search" },
              { method: "GET", path: "/api/v1/organizations/{org}/repositories/{repo}" },
              { method: "GET", path: "/api/v1/organizations/{org}/repositories/{repo}/changesets" },
              { method: "GET", path: "/api/v1/organizations/{org}/repositories/{repo}/browse" },
              { method: "GET", path: "/api/v1/organizations/{org}/repositories/{repo}/refs" },
              { method: "GET", path: "/api/v1/organizations/{org}/repositories/{repo}/pull-requests" },
              { method: "POST", path: "/api/v1/organizations/{org}/repositories/{repo}/pull-requests/{id}/reviews" },
              { method: "POST", path: "/api/v1/organizations/{org}/repositories/{repo}/pull-requests/{id}/merge" },
              { method: "GET", path: "/api/v1/me/ssh-keys" },
              { method: "GET", path: "/api/v1/me/tokens" },
            ],
          },
        ],
      },
      {
        slug: "trouble",
        group: "Reference",
        title: "Troubleshooting",
        blocks: [
          {
            kind: "h2",
            id: "ssl-required",
            text: "abort: HTTP Error 403: ssl required",
          },
          {
            kind: "p",
            content: [
              "Your proxy terminates TLS or forwards client IPs that RevForge doesn’t trust yet. Set ",
              code("REVFORGE_TRUSTED_PROXY_CIDRS"),
              ".",
            ],
          },
          {
            kind: "h2",
            id: "permission-denied",
            text: "remote: permission denied",
          },
          {
            kind: "p",
            content: [
              "Your key or token has read access only. Ask a repository admin for write.",
            ],
          },
          {
            kind: "h2",
            id: "could-not-lock",
            text: "abort: could not lock repository",
          },
          {
            kind: "p",
            content: [
              "The repository is busy. RevForge waits up to 60 seconds, then gives up cleanly.",
            ],
          },
          {
            kind: "h2",
            id: "too-many-requests",
            text: "429 Too Many Requests",
          },
          {
            kind: "p",
            content: [
              "Too many failed sign-ins or token attempts. Wait for the time in ",
              code("Retry-After"),
              ".",
            ],
          },
        ],
      },
    ],
  },
];

export const DOCS_FLAT: readonly DocPage[] = DOC_GROUPS.flatMap((g) => g.pages);

/** Strict static allowlist of all 15 developer docs pages — unknown slugs return 404. */
export const DOCS_BY_SLUG: ReadonlyMap<string, DocPage> = new Map(
  DOCS_FLAT.map((p) => [p.slug, p]),
);
