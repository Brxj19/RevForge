export interface DeveloperDocGroup {
  id: string;
  title: string;
  description: string;
}

export interface DeveloperDocPage {
  slug: string;
  title: string;
  summary: string;
  groupId: string;
  order: number;
  markdown: string;
}

function md(content: string) {
  return content.trim();
}

export const developerDocGroups: DeveloperDocGroup[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description:
      "Orientation, prerequisites, architecture, and the safest local setup path from zero.",
  },
  {
    id: "local-development",
    title: "Local Development",
    description:
      "Environment variables, migrations, stack startup, and the practical day-to-day commands.",
  },
  {
    id: "first-app-usage",
    title: "First App Usage",
    description:
      "From account creation to a ready repository and the first browser-based exploration steps.",
  },
  {
    id: "mercurial-transport",
    title: "Mercurial Transport",
    description:
      "Transport architecture, remote paths, PATs, SSH keys, authorized_keys, and a full first-push tutorial.",
  },
  {
    id: "repository-features",
    title: "Repository Features",
    description:
      "Code browsing, changesets, graph, refs, activity, sessions, and honest review status.",
  },
  {
    id: "operations",
    title: "Operations",
    description:
      "Worker processing, file-spooled events, webhook delivery, and production-minded notes.",
  },
  {
    id: "contributing",
    title: "Contributing",
    description:
      "Project structure, testing, linting, typechecking, and the repo’s contribution workflow.",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description:
      "Concrete checks and fixes for startup, transport, repository, and activity failures.",
  },
];

export const developerDocPages: DeveloperDocPage[] = [
  {
    slug: "introduction",
    title: "Introduction",
    summary:
      "What RevForge is, who it is for, what this branch supports, and what is still future work.",
    groupId: "getting-started",
    order: 10,
    markdown: md(`
# Introduction

RevForge is a self-hosted Mercurial repository forge for repository browsing, changeset history, code review workflows, clone and push access, and operational visibility.

## What problem RevForge solves

RevForge exists for teams that still work in Mercurial and need a product that speaks Mercurial naturally instead of flattening everything into Git vocabulary.

## Who it is for

- teams hosting Mercurial internally
- developers who need browser-based repository browsing
- operators who need controlled clone and push access
- reviewers and auditors who need activity and configuration visibility

## What v1 supports in this branch

- React frontend in the frontend directory
- FastAPI control plane in the backend directory
- PostgreSQL metadata storage
- Redis as part of the expected local stack
- repository provisioning into a canonical storage root
- Mercurial HTTP transport with PAT authentication
- Mercurial SSH transport with forced-command access
- audit and repository activity records
- settings for tokens, SSH keys, sessions, and preferences

## What is still incomplete

- the top-level Reviews page is still a placeholder shell
- production hardening exists in pieces but is not complete enough to oversell as turnkey
- there is no separate Astro or Starlight app in this branch; the docs system lives inside the existing frontend routes

## System overview

~~~text
Frontend -> FastAPI backend -> PostgreSQL/Redis -> Mercurial repositories -> HTTP/SSH transport -> worker/events/webhooks
~~~
`),
  },
  {
    slug: "architecture-at-a-glance",
    title: "Architecture At A Glance",
    summary:
      "The control plane, transport plane, repository storage, and worker boundaries in this branch.",
    groupId: "getting-started",
    order: 20,
    markdown: md(`
# Architecture At A Glance

## High-level diagram

~~~text
Browser
  |
  | REST API
  v
FastAPI backend ---- PostgreSQL
  |                    |
  |                    +-- users/orgs/repos/tokens/events
  |
  +---- Redis
  |
  +---- Mercurial storage root
  |
  +---- HTTP hg gateway
  |
  +---- SSH forced-command gateway
  |
  +---- Worker / event spool / webhooks
~~~

## Frontend role

The frontend renders the authenticated shell, repository pages, settings, activity, clone setup, and this documentation system. It depends on typed API calls from the frontend API client.

## Backend API role

The backend is the control plane. It owns auth, sessions, CSRF, organizations, repositories, permissions, transport metadata, webhook APIs, audit access, and pull request APIs.

## PostgreSQL role

PostgreSQL stores users, organizations, repository metadata, permissions, sessions, PATs, SSH keys, repository events, webhooks, and pull request records.

## Redis role

Redis is part of the expected local stack and supports the broader architecture even though not every deferred workflow is fully surfaced in the UI.

## Mercurial repository storage

Repository metadata and physical repository storage are separate. The database row does not replace the real Mercurial repository on disk.

## Transport plane

- HTTP transport is mounted under the configured hg base path
- SSH transport runs through a forced-command gateway
- both paths aim to work with standard hg clients

## Worker and event spool

Push-oriented events can be written to a file spool, imported into the database, and then processed by the worker for follow-up actions such as webhook delivery.
`),
  },
  {
    slug: "prerequisites",
    title: "Prerequisites",
    summary:
      "Exact tools, expected versions, and verification commands before local setup.",
    groupId: "getting-started",
    order: 30,
    markdown: md(`
# Prerequisites

## Required tools

| Tool | Expected version or note | Why it exists |
| --- | --- | --- |
| Git | modern version | Clone the repository and contribute changes. |
| Python | 3.12 or newer | Required by backend project settings. |
| uv | current version | Used by the Makefile for dependency sync and runtime commands. |
| Node.js | version 20 through 25 | Required by the frontend package configuration. |
| npm | bundled with Node | Installs and runs the frontend toolchain. |
| Docker with Compose | current version | Starts PostgreSQL and Redis for local development. |
| Mercurial | 7.x range | Needed for provisioning and native transport testing. |
| OpenSSH client | current version | Needed for SSH clone and push testing. |
| make | GNU or BSD make | The repo’s top-level workflow is Makefile-driven. |

## Verification commands

~~~bash
git --version
python3 --version
uv --version
node --version
npm --version
hg --version
ssh -V
docker --version
make --version
~~~

## Platform notes

- macOS: install Mercurial with brew install mercurial
- Linux: confirm docker compose, hg, ssh, python3, and venv tooling are on PATH
- Windows: prefer WSL for a Unix-like shell, file path model, and toolchain

## If hg is missing

Symptoms usually include failed Mercurial-backed tests, provisioning failures, or transport errors when the backend tries to run controlled hg commands.
`),
  },
  {
    slug: "local-setup",
    title: "Local Setup",
    summary:
      "A full local setup from clone to a running frontend and backend using the real repo commands.",
    groupId: "getting-started",
    order: 40,
    markdown: md(`
# Local Setup

## Clone the repository

~~~bash
git clone git@github.com:Brxj19/RevForge.git
cd RevForge
~~~

## Start support services

~~~bash
make up
~~~

This uses the compose file declared in the top-level Makefile and builds the full local stack.

It starts:

- PostgreSQL on localhost:5432
- Redis on localhost:6379
- backend on http://localhost:8000
- frontend on http://localhost:5173
- worker event processing
- local OpenSSH dev service for SSH clone and push on localhost:2222

## Host-native backend workflow

~~~bash
make backend-sync
make backend-dev
~~~

What happens here:

- backend virtualenv creation
- automatic pip repair through ensurepip when needed
- cached dependency install that only refreshes when backend dependencies change
- uvicorn reload server on port 8000

## Host-native frontend workflow

~~~bash
make frontend-install
make frontend-dev
~~~

Expected local URLs:

- frontend: http://localhost:5173
- backend: http://localhost:8000

## Expected running services

| Service | Local address | Role |
| --- | --- | --- |
| Frontend | http://localhost:5173 | Browser UI |
| Backend | http://localhost:8000 | Control plane and HTTP transport |
| PostgreSQL | localhost:5432 | Durable metadata |
| Redis | localhost:6379 | Support service |
| Worker | internal compose service | Processes file-spooled events and webhook jobs |
| SSH transport | localhost:2222 | Mercurial SSH clone and push |
| Repository root | ./.local/repositories by default | Physical Mercurial repositories |

## Common local setup problems

### No module named pip

The Makefile now self-heals this by running ensurepip before attempting package installation.

### Frontend cannot talk to backend

Check:

- backend is running
- browser is targeting the same backend instance you just started
- local CORS values still allow the frontend origin

### Mercurial features fail while auth pages work

Check:

- hg is installed
- repository root is configured
- the repository has actually been provisioned
`),
  },
  {
    slug: "environment-variables",
    title: "Environment Variables",
    summary:
      "A detailed guide to backend environment settings, local examples, and common mistakes.",
    groupId: "local-development",
    order: 50,
    markdown: md(`
# Environment Variables

Start from backend/.env.example and then override values in backend/.env.

## Important variables

| Variable | Required | Local example | Purpose | Common mistake |
| --- | --- | --- | --- | --- |
| REVFORGE_ENVIRONMENT | yes | development | Environment label used by settings. | Expecting it to toggle complex behavior by itself. |
| REVFORGE_DATABASE_URL | yes | postgresql+asyncpg://revforge:revforge@localhost:5432/revforge | SQLAlchemy async database URL. | Forgetting the asyncpg driver prefix. |
| REVFORGE_REDIS_URL | yes | redis://localhost:6379/0 | Redis connection string. | Pointing to the wrong host or DB index. |
| REVFORGE_SESSION_SECRET_KEY | yes | change-me-in-local-env | Session signing key. | Reusing the default anywhere persistent. |
| REVFORGE_SESSION_COOKIE_SECURE | yes | false locally | Controls secure cookie behavior. | Leaving it false behind HTTPS. |
| REVFORGE_REPOSITORY_ROOT | yes | ./.local/repositories | Canonical repository storage root. | Using a non-persistent or inaccessible path. |
| REVFORGE_PUBLIC_BASE_URL | strongly recommended | http://localhost:8000 | Canonical backend public URL. | Forgetting it affects generated transport metadata. |
| REVFORGE_HG_HTTP_PUBLIC_BASE_URL | strongly recommended | http://localhost:8000/hg | Public clone base for Mercurial HTTP. | Setting it to the API root instead of the hg root. |
| REVFORGE_HG_HTTP_BASE_PATH | yes | /hg | Internal mount path for Mercurial HTTP. | Omitting the leading slash. |
| REVFORGE_SSH_PUBLIC_HOST | strongly recommended | localhost | Host shown in SSH clone commands. | Leaving localhost in shared environments. |
| REVFORGE_SSH_PUBLIC_PORT | optional | 2222 | Alternate SSH port. | Forgetting to expose the same port in SSH infrastructure. |
| REVFORGE_TRANSPORT_HG_USERNAME | yes | revforge-hg | SSH username for transport. | Trying to use the human email as the SSH username. |
| REVFORGE_TRANSPORT_TOKEN_SECRET | yes | change-me-transport-secret | Secret used by transport credential logic. | Keeping the placeholder value. |
| REVFORGE_SSH_AUTHORIZED_KEYS_PATH | yes | ./.local/ssh/authorized_keys | Managed authorized_keys output path. | Pointing at a file OpenSSH never reads. |
| REVFORGE_SSH_GATEWAY_COMMAND | yes | /usr/local/bin/revforge-ssh-gateway | Forced command executed by OpenSSH. | Pointing at a host path that does not exist inside the SSH container. |
| REVFORGE_EVENT_SPOOL_DIR | optional but useful | ./.local/event-spool | File spool directory for push events. | Expecting worker import without setting or mounting it. |
| REVFORGE_TRUST_PROXY_HEADERS | not implemented in this branch | n/a | Planned reverse-proxy control. | Assuming this branch already honors it. |

## Mercurial and output safety controls

- REVFORGE_HG_EXECUTABLE
- REVFORGE_HG_COMMAND_TIMEOUT_SECONDS
- REVFORGE_HG_MAX_STDOUT_BYTES
- REVFORGE_HG_MAX_STDERR_BYTES
- REVFORGE_MAX_DIFF_BYTES
- REVFORGE_MAX_FILE_CONTENT_BYTES
- REVFORGE_MAX_HISTORY_PAGE_SIZE

## Session and browser settings

- REVFORGE_SESSION_COOKIE_NAME
- REVFORGE_CSRF_COOKIE_NAME
- REVFORGE_SESSION_COOKIE_HTTPONLY
- REVFORGE_SESSION_COOKIE_SAMESITE
- REVFORGE_SESSION_COOKIE_DOMAIN
- REVFORGE_SESSION_TTL_MINUTES
- REVFORGE_PASSWORD_MIN_LENGTH
- REVFORGE_CORS_ALLOWED_ORIGINS

## Security notes

- never keep placeholder secrets in real environments
- make sure generated clone URLs reflect the correct public host and path
- keep repository storage, authorized_keys output, and event spool paths persistent
`),
  },
  {
    slug: "database-and-migrations",
    title: "Database And Migrations",
    summary:
      "How migrations run, what the database stores, and how to inspect local schema state safely.",
    groupId: "local-development",
    order: 60,
    markdown: md(`
# Database And Migrations

## What the database stores

PostgreSQL stores users, sessions, organizations, repositories, repository permissions, PATs, SSH keys, repository events, webhooks, event spool entries, and pull request records.

## Run migrations

~~~bash
make migrate
~~~

Equivalent backend-local command:

~~~bash
cd backend
uv run alembic upgrade head
~~~

## Create a new migration

~~~bash
make migration name="describe-change"
~~~

## Inspect migration state

~~~bash
cd backend
uv run alembic current
uv run alembic history
~~~

## Safe local reset guidance

There is no dedicated single-command database reset in this branch. The safe path is:

1. stop app processes
2. reset the local PostgreSQL data through Docker tooling if you truly need a clean slate
3. rerun make up
4. rerun make migrate

Do not manually patch alembic metadata tables as a shortcut.
`),
  },
  {
    slug: "running-the-full-stack",
    title: "Running The Full Stack",
    summary:
      "Recommended startup order, health checks, and the most useful local development commands.",
    groupId: "local-development",
    order: 70,
    markdown: md(`
# Running The Full Stack

## Recommended order

~~~bash
make up
~~~

That command now builds and starts PostgreSQL, Redis, backend, worker, frontend, and the local SSH transport container together.

If you prefer running the backend and frontend directly on your machine, use:

~~~bash
make backend-sync
make migrate
make backend-dev
make frontend-install
make frontend-dev
~~~

When the Docker stack is running, refresh managed SSH keys with make ssh-sync.
If the backend is running directly on your machine, use make ssh-sync-host.

If you want local SSH clone and push to work, refresh the managed SSH keys after adding a key in the UI:

~~~bash
make ssh-sync
~~~

## What success looks like

- backend health responds on /health
- API health responds on /api/v1/health
- frontend loads at http://localhost:5173
- registration and sign-in work
- authenticated pages stop redirecting once you sign in

## Day-to-day commands

~~~bash
make test
make lint
make format
make typecheck
~~~

## Focused backend commands

~~~bash
cd backend
uv run pytest
uv run ruff check .
uv run mypy app
~~~

## Focused frontend commands

~~~bash
cd frontend
npm run lint
npm run typecheck
npm run build
npm run test
~~~
`),
  },
  {
    slug: "first-app-usage",
    title: "First App Usage",
    summary:
      "A real first-run walkthrough from registration to a provisioned repository and visible browser routes.",
    groupId: "first-app-usage",
    order: 80,
    markdown: md(`
# First App Usage

## Tutorial goals

This guide takes a fresh developer from zero application state to a repository that can be browsed and prepared for transport access.

## Step-by-step flow

1. Open the frontend at http://localhost:5173
2. Register a user account
3. Sign in
4. Create an organization
5. Create a repository
6. Provision repository storage
7. Open the repository overview
8. Open Code, History, Graph, and ref pages
9. Open Clone setup
10. Create a PAT
11. Add an SSH key
12. Verify activity later after transport use

## Expected results

- authenticated shell loads without redirect loops
- repository shows an explicit provisioning state
- clone setup reflects backend transport metadata
- settings tabs expose tokens, SSH keys, sessions, and preferences
`),
  },
  {
    slug: "repository-provisioning",
    title: "Repository Provisioning",
    summary:
      "How repository metadata becomes a real Mercurial repository and what each provisioning state means.",
    groupId: "first-app-usage",
    order: 90,
    markdown: md(`
# Repository Provisioning

## Metadata vs physical storage

RevForge stores repository identity and policy in PostgreSQL, but the real Mercurial repository lives on disk under the configured repository root.

## Provisioning states

- unprovisioned
- provisioning
- ready
- failed

## Meaning of each state

| State | Meaning | Clone allowed |
| --- | --- | --- |
| unprovisioned | Metadata exists, storage does not. | No |
| provisioning | Storage creation is in progress. | No |
| ready | Storage exists and browsing or clone can proceed. | Yes, if permission also allows it |
| failed | Provisioning did not complete. | No |

## Debugging failed provisioning

Check:

- REVFORGE_REPOSITORY_ROOT exists and is writable
- hg is installed and available to the backend
- backend logs contain the real provisioning error
- the repository slug resolves correctly
`),
  },
  {
    slug: "transport-architecture",
    title: "Transport Architecture",
    summary:
      "How RevForge handles native Mercurial HTTPS and SSH access without inventing a custom client.",
    groupId: "mercurial-transport",
    order: 100,
    markdown: md(`
# Transport Architecture

## Design goal

RevForge should work with standard hg clients. Developers should be able to run clone, pull, and push with ordinary Mercurial commands.

## HTTPS transport

The HTTP gateway is mounted at the configured hg base path, usually /hg. It uses PAT-backed basic auth for Mercurial client operations.

## SSH transport

SSH uses a forced-command gateway. OpenSSH matches a generated authorized_keys entry, then invokes the Mercurial SSH gateway instead of a user shell.

## Permission model

Transport permission combines:

- credential validity
- repository permission
- repository readiness
- transport-specific rules such as read versus write capability

## Event recording

Transport flows emit activity and transport audit records. Push-related paths can also write to the event spool for later worker processing.
`),
  },
  {
    slug: "configuring-mercurial-remotes",
    title: "Configuring Mercurial Remotes",
    summary:
      "How Mercurial stores remote paths in .hg/hgrc, how default and default-push work, and how to inspect or fix them.",
    groupId: "mercurial-transport",
    order: 105,
    markdown: md(`
# Configuring Mercurial Remotes

## Where Mercurial stores remote paths

Mercurial stores repository-specific remote configuration in:

~~~text
.hg/hgrc
~~~

The most important section is the paths section.

## HTTPS path example

~~~ini
[paths]
default = https://localhost:8000/hg/acme/payments-api
~~~

## SSH path example

~~~ini
[paths]
default = ssh://revforge-hg@localhost/acme/payments-api
~~~

If SSH uses a custom port:

~~~ini
[paths]
default = ssh://revforge-hg@localhost:2222/acme/payments-api
~~~

## What default means

- hg pull uses default
- hg push uses default if default-push is not configured
- hg clone <url> usually writes default automatically
- users can edit .hg/hgrc manually if the remote changes later

## Optional default-push

~~~ini
[paths]
default = https://localhost:8000/hg/acme/payments-api
default-push = ssh://revforge-hg@localhost/acme/payments-api
~~~

This setup means:

- pull from HTTPS
- push through SSH

That can be useful when a team wants read access over HTTPS and write access over SSH.

## Inspect configured paths

Show all configured paths:

~~~bash
hg paths
~~~

Show the default path:

~~~bash
hg paths default
~~~

Inspect the raw repository config:

~~~bash
cat .hg/hgrc
~~~

## Example full local repository config

~~~ini
[paths]
default = ssh://revforge-hg@localhost/acme/payments-api

[ui]
username = Tatwa Brajesh <tatwa@example.com>
~~~

## Global Mercurial user config

Repository paths live in .hg/hgrc, but commit author identity is usually set globally.

Linux and macOS:

~~~bash
nano ~/.hgrc
~~~

Windows:

~~~text
%USERPROFILE%\\Mercurial.ini
~~~

Example:

~~~ini
[ui]
username = Tatwa Brajesh <tatwa@example.com>
~~~

Important: this username controls commit author metadata. It is not RevForge login authentication.

## SSH key reuse across repositories

You do not need to upload a new SSH key for every repository.

In RevForge, SSH keys are attached to your user profile on the current RevForge instance. One active key can be reused across multiple repositories on the same host as long as:

- the repository is provisioned
- your account has permission to access that repository
- the key is still active and not revoked

If your team runs another separate RevForge host, add the key there too unless that environment already shares the same SSH key registration.

## First commit workflow

~~~bash
hg status
echo "Hello RevForge" > README.md
hg add README.md
hg commit -m "Add README"
hg log --graph --limit 5
hg push
~~~

## Pull and update workflow

~~~bash
hg pull
hg update
~~~

Explanation:

- hg pull downloads changesets
- hg update updates the working directory
- hg pull -u does both

## Branch, bookmark, and tag examples

Named branch:

~~~bash
hg branch feature-api
hg commit -m "Start feature branch"
hg push
~~~

Bookmark:

~~~bash
hg bookmark feature-ui
hg push -B feature-ui
~~~

Tag:

~~~bash
hg tag v0.1.0
hg push
~~~

## Troubleshooting remote configuration

## abort: repository default not found

Likely cause:

- .hg/hgrc has no paths.default
- the clone URL was not saved
- the repository was initialized manually with hg init

Fix:

~~~ini
[paths]
default = ssh://revforge-hg@localhost/acme/payments-api
~~~

## Wrong remote URL

Check:

~~~bash
hg paths
cat .hg/hgrc
~~~

Fix the path in .hg/hgrc.

## Push goes to the wrong server

Likely cause:

- default-push is configured incorrectly
- default points to another server

Check:

~~~bash
hg paths
~~~

Fix:

~~~ini
[paths]
default = ssh://revforge-hg@localhost/acme/payments-api
~~~

Or remove the wrong default-push value.

## Commit author is wrong

Fix the global config:

~~~ini
[ui]
username = Your Name <you@example.com>
~~~

Future commits will use the new author value.

## HTTPS keeps asking for username and password

Remember:

- username should be the RevForge account email
- password should be the PAT
- cached credentials may be wrong
- the token may be expired or revoked
- a read token cannot push

## SSH permission denied

Likely causes:

- wrong SSH username
- public key not added to RevForge
- authorized_keys not synced
- wrong host or port
- repository permission missing
`),
  },
  {
    slug: "https-clone-with-pat",
    title: "HTTPS Clone With PAT",
    summary:
      "A full guide to cloning, pulling, committing, and pushing over HTTPS with a Personal Access Token.",
    groupId: "mercurial-transport",
    order: 110,
    markdown: md(`
# HTTPS Clone With PAT

## Authentication rules

- username must be the account email
- password must be the PAT plaintext value
- do not paste the PAT into the URL
- repository permission still matters even with a valid token
- Mercurial usually writes the clone source into .hg/hgrc as paths.default

## Example clone

~~~bash
hg clone http://localhost:8000/hg/acme/payments-api
~~~

When prompted:

~~~text
username: user@example.com
password: <paste personal access token>
~~~

## Pull example

~~~bash
cd payments-api
hg pull
~~~

## Commit and push example

~~~bash
echo "hello" > README.md
hg add README.md
hg commit -m "Add README"
hg push
~~~

## Expected result

Push succeeds only when the PAT has write capability and the user also has write or admin access on the repository.

## Troubleshooting

- 401 usually means wrong email, wrong token, expired token, or revoked token
- repeated prompts often mean the wrong URL or cached bad credentials
- failed push with a read token is expected
`),
  },
  {
    slug: "personal-access-tokens",
    title: "Personal Access Tokens",
    summary:
      "Capabilities, expiry, scope, revocation, and practical PAT security advice.",
    groupId: "mercurial-transport",
    order: 120,
    markdown: md(`
# Personal Access Tokens

## Where to manage them

Open the user settings tokens tab and create a token with a clear name, capability, optional expiry, and optional scope.

## Capability model

| Capability | Allows | Does not allow |
| --- | --- | --- |
| read | clone and pull | push |
| write | clone, pull, and push if repository permission also allows it | admin settings by itself |

## Important rule

A write PAT does not automatically grant repository write access. Repository permission still decides whether push is allowed.

## Lifecycle guidance

- plaintext is shown once
- copy it safely when created
- revoke tokens you no longer need
- rotate instead of sharing one long-lived token across many machines
`),
  },
  {
    slug: "ssh-clone",
    title: "SSH Clone",
    summary:
      "Generate a key, add it to RevForge, and use the forced-command SSH transport safely.",
    groupId: "mercurial-transport",
    order: 130,
    markdown: md(`
# SSH Clone

## Generate a key

~~~bash
ssh-keygen -t ed25519 -C "user@example.com"
cat ~/.ssh/id_ed25519.pub
~~~

## Add the public key

Open the SSH keys tab in user settings, paste the public key, and label it clearly.

## Do you need to add a key for every repository

No. RevForge stores SSH keys on your user profile for the current RevForge instance, not per repository.

That means one uploaded active key can be reused across multiple repositories on the same RevForge host, similar to how GitHub SSH access usually feels. You only need repository-level permission for the repositories you want to clone, pull, or push.

If you use a different RevForge server or environment, add the key there too unless that deployment already shares the same SSH key registration.

## SSH username

The SSH username comes from the transport setting and is not the user email. The default in this branch is revforge-hg.

## Example clone commands

~~~bash
hg clone ssh://revforge-hg@localhost/acme/payments-api
~~~

With a custom port:

~~~bash
hg clone ssh://revforge-hg@localhost:2222/acme/payments-api
~~~

## Local dev requirement

In this branch, the backend API does not listen on the SSH port by itself.

Local SSH transport works only when the dedicated OpenSSH dev service is running, which make up now starts on localhost:2222.

## Important behavior

- uploaded key maps to a RevForge user
- users do not receive an interactive shell
- SSH_ORIGINAL_COMMAND carries the Mercurial server command
`),
  },
  {
    slug: "authorized-keys-and-ssh-gateway",
    title: "authorized_keys And SSH Gateway",
    summary:
      "How the managed authorized_keys file works and how to validate the forced-command chain.",
    groupId: "mercurial-transport",
    order: 140,
    markdown: md(`
# authorized_keys And SSH Gateway

## What the file contains

RevForge renders one authorized_keys line per active, non-revoked SSH key whose owning user is active.

Each line contains:

- a forced command
- restrictive options like no-pty
- the normalized public key
- a RevForge comment with key and user IDs

## Render the file

~~~bash
make ssh-sync
~~~

With an explicit path:

~~~bash
cd backend
uv run python -m app.mercurial.authorized_keys ./.local/ssh/authorized_keys
~~~

## Expected command shape

~~~text
command="python -m app.mercurial.ssh_gateway <key-id>",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA... revforge key_id=<key-id> user_id=<user-id>
~~~

## Manual checks

1. regenerate the file
2. verify the output path matches what OpenSSH reads
3. verify the forced command matches your intended Python environment
4. inspect SSH_ORIGINAL_COMMAND during a test clone or push
5. verify the local sshd service from make up is listening on localhost:2222
`),
  },
  {
    slug: "clone-pull-commit-push-tutorial",
    title: "Clone, Pull, Commit, Push Tutorial",
    summary:
      "An end-to-end tutorial from an empty RevForge repository to the first pushed changeset.",
    groupId: "mercurial-transport",
    order: 150,
    markdown: md(`
# Clone, Pull, Commit, Push Tutorial

## Goal

Take a provisioned but empty repository and push the first changeset into it using a real hg client.

## Step 1: Clone the repository

~~~bash
hg clone http://localhost:8000/hg/acme/payments-api
cd payments-api
~~~

Mercurial usually writes the remote into the local repository configuration.

Check it:

~~~bash
hg paths
cat .hg/hgrc
~~~

Example:

~~~ini
[paths]
default = http://localhost:8000/hg/acme/payments-api
~~~

If you want reads over HTTPS and writes over SSH:

~~~ini
[paths]
default = http://localhost:8000/hg/acme/payments-api
default-push = ssh://revforge-hg@localhost/acme/payments-api
~~~

## Step 2: Confirm commit author identity

Global Mercurial user identity controls commit author metadata, not RevForge login auth.

Linux and macOS:

~~~bash
nano ~/.hgrc
~~~

Windows:

~~~text
%USERPROFILE%\\Mercurial.ini
~~~

Example:

~~~ini
[ui]
username = Tatwa Brajesh <tatwa@example.com>
~~~

## Step 3: Create the first content change

~~~bash
echo "# Payments API" > README.md
hg status
hg add README.md
hg commit -m "Add README"
hg log --graph --limit 5
hg push
~~~

## Step 4: Pull and update later

~~~bash
hg pull
hg update
~~~

Or:

~~~bash
hg pull -u
~~~

## Step 5: Try a branch, bookmark, or tag

Named branch:

~~~bash
hg branch feature-api
hg commit -m "Start feature branch"
hg push
~~~

Bookmark:

~~~bash
hg bookmark feature-ui
hg push -B feature-ui
~~~

Tag:

~~~bash
hg tag v0.1.0
hg push
~~~

## What to verify afterward

- history shows the new changeset
- graph shows the new node
- code browser shows README.md
- repository activity reflects the push after the relevant event path completes
- changeset stats appear where available
`),
  },
  {
    slug: "repository-features",
    title: "Repository Features",
    summary:
      "Code browser, changesets, graph, refs, activity, sessions, and the current review status in one place.",
    groupId: "repository-features",
    order: 160,
    markdown: md(`
# Repository Features

## Code browser

The Code tab is revision-aware and path-aware. It supports file browsing, directory navigation, markdown preview, binary-file handling, and large-file handling.

## History and changesets

RevForge uses Mercurial terminology intentionally. Changeset detail includes node information, parents, author, timestamp, changed files, and diff access.

## Graph view

The graph route is the visual ancestry view. It is best for understanding merges, divergence, and lane structure.

## Branches, bookmarks, and tags

These are separate Mercurial concepts and are exposed separately in the UI. Bookmarks are treated as first-class refs in this branch.

## Activity and audit

Activity views come from backend records. They should be treated as operational evidence, not decorative feed content.

## Sessions and settings

User settings cover tokens, SSH keys, sessions, and preferences in one place.

## Reviews status

Backend pull request and review APIs exist, but the top-level Reviews page in the frontend is still a placeholder shell. Document that honestly.
`),
  },
  {
    slug: "worker-and-webhooks",
    title: "Worker And Webhooks",
    summary:
      "How the worker processes file-spooled events and how webhook delivery works in this branch.",
    groupId: "operations",
    order: 170,
    markdown: md(`
# Worker And Webhooks

## Worker responsibilities

The worker:

- imports file-spooled events into the database
- claims pending event spool entries
- processes push-related entries
- attempts webhook delivery for active repository webhooks

## Run the worker locally

~~~bash
cd backend
uv run python -m app.worker
~~~

Optional poll interval:

~~~bash
cd backend
uv run python -m app.worker 2
~~~

## Event spool

The file spool path is controlled by REVFORGE_EVENT_SPOOL_DIR. The worker imports JSON files from that directory into the database-backed event flow.

## Webhooks

This branch includes repository-scoped webhook APIs plus frontend repository settings for:

- listing webhooks
- creating webhooks
- enabling or disabling webhooks
- deleting webhooks
- viewing delivery history

## Security notes

- outbound webhook URLs are security-sensitive
- delivery can fail because of SSRF protection, network reachability, or target behavior
- if delivery history is empty, confirm the worker is actually running
`),
  },
  {
    slug: "production-and-reverse-proxy",
    title: "Production And Reverse Proxy Notes",
    summary:
      "First-version deployment guidance, persistence expectations, and the most important security checklist items.",
    groupId: "operations",
    order: 180,
    markdown: md(`
# Production And Reverse Proxy Notes

## Current maturity statement

This branch is suitable for serious local and controlled internal testing, but the documentation should not overclaim turnkey production readiness.

## Public URL settings

- REVFORGE_PUBLIC_BASE_URL
- REVFORGE_HG_HTTP_PUBLIC_BASE_URL
- REVFORGE_SSH_PUBLIC_HOST
- REVFORGE_SSH_PUBLIC_PORT

If these are wrong, clone instructions will also be wrong.

## Persistence requirements

- persist repository storage
- persist PostgreSQL data
- persist Redis data as appropriate
- persist the managed authorized_keys path
- persist or intentionally manage the event spool directory

## Security checklist

- do not use default secrets
- use HTTPS
- use secure cookies behind HTTPS
- run the worker if you rely on event processing or webhooks
- back up the repository root and the database
- do not assume trust-proxy-header support that this branch does not yet implement
`),
  },
  {
    slug: "contributor-workflow",
    title: "Contributor Workflow",
    summary:
      "Project structure, validation commands, docs hygiene, and the Codex-aware contributor loop.",
    groupId: "contributing",
    order: 190,
    markdown: md(`
# Contributor Workflow

## Project structure

- backend for FastAPI, Mercurial integration, models, services, and migrations
- frontend for React routes, app shell, docs UI, and tests
- docs for architecture notes, ADRs, and process documents
- infra for local compose services

## Validation commands

~~~bash
make test
make lint
make typecheck
~~~

Focused commands:

~~~bash
cd backend
uv run pytest
uv run ruff check .
uv run mypy app

cd ../frontend
npm run lint
npm run typecheck
npm run build
npm run test
~~~

## Workflow habits

- keep commands accurate to the repo
- do not document fake support
- update docs when behavior changes
- read AGENTS.md, DESIGN.md, and docs/CODEX_WORKFLOW.md before larger changes
`),
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    summary:
      "Concrete symptoms, likely causes, checks, and fixes for the most common failures in this branch.",
    groupId: "troubleshooting",
    order: 200,
    markdown: md(`
# Troubleshooting

## Backend does not start

Checks:

- python3 version
- backend virtualenv health
- pip availability inside backend/.venv
- backend environment values

Fix:

- rerun make backend-sync

## Frontend cannot reach backend

Symptoms:

- blank activity panel
- blank clone setup UI

Checks:

- backend is running on port 8000
- browser is hitting the backend instance you expect
- the requested API route actually exists in the running server

## Database or Redis connection failures

Checks:

- make up
- local container health
- correct connection URLs

## Repository provisioning failed

Checks:

- repository root path
- hg availability
- backend logs

## HTTPS auth problems

Checks:

- username is the account email
- password is the PAT
- token is not expired or revoked
- clone URL uses the hg transport path

## SSH problems

Checks:

- transport username is correct
- key uploaded successfully
- authorized_keys file regenerated
- forced command path is correct

## Push succeeded but activity is empty

Checks:

- repository event creation path
- event spool configuration
- worker status if spool import is involved
- frontend backend target

## Webhook delivery failed

Checks:

- worker running
- webhook active
- destination reachable
- SSRF restrictions not intentionally blocking the URL
`),
  },
];

export const developerDocPageBySlug = new Map(
  developerDocPages.map((page) => [page.slug, page]),
);

export const developerDocPagesInOrder = [...developerDocPages].sort(
  (left, right) => left.order - right.order,
);
