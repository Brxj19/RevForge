# RevForge Local Stack Setup and Troubleshooting

This guide is the single place for setting up, running, rebuilding, and debugging the full RevForge stack on macOS, Linux, and Windows.

It covers:

- Docker-based full-stack development
- host-native backend and frontend development
- Mercurial and SSH transport setup
- the Make targets used by this repository
- common failures and how to fix them

## 1. What runs in the local stack

RevForge local development uses these services and ports:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- backend API and Mercurial HTTP transport: `http://localhost:8000`
- frontend: `http://localhost:5173`
- SSH transport for Mercurial: `localhost:2222`

## 2. Platform notes

### macOS

Recommended tools:

- Docker Desktop
- Homebrew
- Python `3.12+`
- Node.js `20.x` or `22.x`
- Mercurial `7.x`

Install Mercurial:

```bash
brew install mercurial
```

Optional:

```bash
brew install python@3.12
brew install node@22
```

### Linux

Recommended tools:

- Docker Engine
- Docker Compose plugin
- Python `3.12+`
- Node.js `20.x` or `22.x`
- Mercurial `7.x`

Example on Ubuntu or Debian:

```bash
sudo apt update
sudo apt install -y mercurial python3 python3-venv python3-pip
```

### Windows

Recommended tools:

- Docker Desktop
- WSL2 with Ubuntu
- Git
- Python `3.12+`
- Node.js `20.x` or `22.x`
- Mercurial

Recommended workflow:

- use Docker Desktop for the full stack
- use WSL2 for host-native backend and frontend work
- use PowerShell mainly for Docker Desktop based commands if needed

Example inside WSL2 Ubuntu:

```bash
sudo apt update
sudo apt install -y mercurial python3 python3-venv python3-pip
```

## 3. Clone the repository

### macOS/Linux

```bash
git clone git@github.com:Brxj19/RevForge.git
cd RevForge
```

### Windows PowerShell

```powershell
git clone git@github.com:Brxj19/RevForge.git
Set-Location RevForge
```

### Windows WSL2

```bash
git clone git@github.com:Brxj19/RevForge.git
cd RevForge
```

## 4. Create local env files

### macOS/Linux

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### Windows PowerShell

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

### Windows WSL2

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Important defaults:

- backend expects Postgres on `localhost:5432`
- backend expects Redis on `localhost:6379`
- backend public URL is `http://localhost:8000`
- Mercurial HTTP base URL is `http://localhost:8000/hg`
- SSH public host is `localhost`
- SSH public port defaults to `2222`

## 5. Full stack with Docker

This is the easiest and most reliable way to run everything.

### Start the stack

#### macOS/Linux

```bash
make up
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

#### Windows WSL2

```bash
make up
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

### Check service status

#### macOS/Linux

```bash
make ps
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml ps
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml ps
```

#### Windows WSL2

```bash
make ps
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml ps
```

### Follow logs

#### macOS/Linux

```bash
make logs
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml logs -f --tail=200
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml logs -f --tail=200
```

#### Windows WSL2

```bash
make logs
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml logs -f --tail=200
```

### Open the UI

```text
http://localhost:5173
```

### Stop the stack

#### macOS/Linux

```bash
make down
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml down --remove-orphans
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml down --remove-orphans
```

#### Windows WSL2

```bash
make down
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml down --remove-orphans
```

## 6. Host-native backend and frontend

Use this when you want faster reload than rebuilding Docker images after every code change.

### Start only the supporting services

#### macOS/Linux

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis sshd
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml up -d postgres redis sshd
```

#### Windows WSL2

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis sshd
```

### Install backend dependencies

#### macOS/Linux

```bash
make backend-sync
```

#### Windows PowerShell

```powershell
py -3 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m ensurepip --upgrade
backend/.venv/Scripts/python.exe -m pip install --upgrade pip setuptools wheel
backend/.venv/Scripts/python.exe -m pip install -e ./backend
backend/.venv/Scripts/python.exe -m pip install pytest pytest-asyncio ruff mypy
```

#### Windows WSL2

```bash
make backend-sync
```

### Run migrations

#### macOS/Linux

```bash
make migrate
```

Raw equivalent:

```bash
cd backend && .venv/bin/python -m alembic upgrade head
```

#### Windows PowerShell

```powershell
Push-Location backend
.venv\Scripts\python.exe -m alembic upgrade head
Pop-Location
```

#### Windows WSL2

```bash
make migrate
```

Raw equivalent:

```bash
cd backend && .venv/bin/python -m alembic upgrade head
```

### Run the backend locally

#### macOS/Linux

```bash
make backend-dev
```

Raw equivalent:

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Windows PowerShell

```powershell
Push-Location backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
Pop-Location
```

#### Windows WSL2

```bash
make backend-dev
```

Raw equivalent:

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Install frontend dependencies

#### macOS/Linux

```bash
make frontend-install
```

#### Windows PowerShell

```powershell
Push-Location frontend
npm install
Pop-Location
```

#### Windows WSL2

```bash
make frontend-install
```

### Run the frontend locally

#### macOS/Linux

```bash
make frontend-dev
```

Raw equivalent:

```bash
cd frontend && npm run dev -- --host 0.0.0.0 --port 5173
```

#### Windows PowerShell

```powershell
Push-Location frontend
npm run dev -- --host 0.0.0.0 --port 5173
Pop-Location
```

#### Windows WSL2

```bash
make frontend-dev
```

Raw equivalent:

```bash
cd frontend && npm run dev -- --host 0.0.0.0 --port 5173
```

### Open the UI

```text
http://localhost:5173
```

## 7. Environment exports for host-native backend

If you want to export values manually instead of using `backend/.env`, use these commands.

### macOS/Linux

```bash
export REVFORGE_REPOSITORY_ROOT=./.local/repositories
export REVFORGE_PUBLIC_BASE_URL=http://localhost:8000
export REVFORGE_HG_HTTP_BASE_PATH=/hg
export REVFORGE_HG_HTTP_PUBLIC_BASE_URL=http://localhost:8000/hg
export REVFORGE_SSH_PUBLIC_HOST=localhost
export REVFORGE_SSH_PUBLIC_PORT=2222
export REVFORGE_TRANSPORT_HG_USERNAME=revforge-hg
export REVFORGE_TRANSPORT_TOKEN_SECRET=change-me-transport-secret
export REVFORGE_SSH_AUTHORIZED_KEYS_PATH=./.local/ssh/authorized_keys
export REVFORGE_SSH_GATEWAY_COMMAND=/usr/local/bin/revforge-ssh-gateway
```

### Windows PowerShell

```powershell
$env:REVFORGE_REPOSITORY_ROOT="./.local/repositories"
$env:REVFORGE_PUBLIC_BASE_URL="http://localhost:8000"
$env:REVFORGE_HG_HTTP_BASE_PATH="/hg"
$env:REVFORGE_HG_HTTP_PUBLIC_BASE_URL="http://localhost:8000/hg"
$env:REVFORGE_SSH_PUBLIC_HOST="localhost"
$env:REVFORGE_SSH_PUBLIC_PORT="2222"
$env:REVFORGE_TRANSPORT_HG_USERNAME="revforge-hg"
$env:REVFORGE_TRANSPORT_TOKEN_SECRET="change-me-transport-secret"
$env:REVFORGE_SSH_AUTHORIZED_KEYS_PATH="./.local/ssh/authorized_keys"
$env:REVFORGE_SSH_GATEWAY_COMMAND="/usr/local/bin/revforge-ssh-gateway"
```

### Windows WSL2

```bash
export REVFORGE_REPOSITORY_ROOT=./.local/repositories
export REVFORGE_PUBLIC_BASE_URL=http://localhost:8000
export REVFORGE_HG_HTTP_BASE_PATH=/hg
export REVFORGE_HG_HTTP_PUBLIC_BASE_URL=http://localhost:8000/hg
export REVFORGE_SSH_PUBLIC_HOST=localhost
export REVFORGE_SSH_PUBLIC_PORT=2222
export REVFORGE_TRANSPORT_HG_USERNAME=revforge-hg
export REVFORGE_TRANSPORT_TOKEN_SECRET=change-me-transport-secret
export REVFORGE_SSH_AUTHORIZED_KEYS_PATH=./.local/ssh/authorized_keys
export REVFORGE_SSH_GATEWAY_COMMAND=/usr/local/bin/revforge-ssh-gateway
```

`REVFORGE_SSH_GATEWAY_COMMAND` is rendered into the managed `authorized_keys` file and must point to the gateway path expected by the SSH environment.

## 8. Make targets and direct equivalents

These are the main Make targets:

```bash
make help
make up
make down
make ps
make logs
make backend-sync
make backend-dev
make frontend-install
make frontend-dev
make ssh-sync
make ssh-sync-host
make migrate
make test
make lint
make format
make typecheck
make clean
```

If you are on Windows without `make`, use these direct commands instead.

### `make help`

Windows PowerShell:

```powershell
Get-Content Makefile
```

### `make up`

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

### `make down`

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml down --remove-orphans
```

### `make ps`

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml ps
```

### `make logs`

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml logs -f --tail=200
```

### `make ssh-sync`

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
```

### `make ssh-sync-host`

Windows PowerShell:

```powershell
Push-Location backend
$env:REVFORGE_SSH_GATEWAY_COMMAND="/usr/local/bin/revforge-ssh-gateway"
.venv\Scripts\python.exe -m app.mercurial.authorized_keys
Pop-Location
```

### `make test`

Windows PowerShell:

```powershell
Push-Location backend
.venv\Scripts\python.exe -m pytest
Pop-Location
Push-Location frontend
npm run test
Pop-Location
```

### `make lint`

Windows PowerShell:

```powershell
Push-Location backend
.venv\Scripts\python.exe -m ruff check .
Pop-Location
Push-Location frontend
npm run lint
Pop-Location
```

### `make format`

Windows PowerShell:

```powershell
Push-Location backend
.venv\Scripts\python.exe -m ruff format .
Pop-Location
Push-Location frontend
npm run format
Pop-Location
```

### `make typecheck`

Windows PowerShell:

```powershell
Push-Location backend
.venv\Scripts\python.exe -m mypy app
Pop-Location
Push-Location frontend
npm run typecheck
Pop-Location
```

### `make clean`

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force backend/.venv, frontend/node_modules, .cache
```

## 9. Docker rebuild commands

If you change code while running the Docker stack, rebuild the affected service.

### Rebuild the whole stack

#### macOS/Linux

```bash
make up
```

Raw equivalent:

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

#### Windows WSL2

```bash
make up
```

### Rebuild only the frontend

#### macOS/Linux

```bash
docker compose -f infra/docker-compose.yml up -d --build frontend
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml up -d --build frontend
```

#### Windows WSL2

```bash
docker compose -f infra/docker-compose.yml up -d --build frontend
```

### Rebuild only the backend and worker

#### macOS/Linux

```bash
docker compose -f infra/docker-compose.yml up -d --build backend worker
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml up -d --build backend worker
```

#### Windows WSL2

```bash
docker compose -f infra/docker-compose.yml up -d --build backend worker
```

### Rebuild only SSH transport

#### macOS/Linux

```bash
docker compose -f infra/docker-compose.yml up -d --build sshd
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml up -d --build sshd
```

#### Windows WSL2

```bash
docker compose -f infra/docker-compose.yml up -d --build sshd
```

Important:

- rebuilding containers does not erase PostgreSQL or Redis data by itself
- this repo stores database data in Docker named volumes
- data is erased only if you remove volumes explicitly, for example with `docker compose down -v`

## 10. Mercurial over HTTP

HTTP transport is served from:

```text
http://localhost:8000/hg
```

### Clone over HTTP

#### macOS/Linux

```bash
hg clone http://localhost:8000/hg/<org>/<repo>
```

#### Windows PowerShell

```powershell
hg clone http://localhost:8000/hg/<org>/<repo>
```

#### Windows WSL2

```bash
hg clone http://localhost:8000/hg/<org>/<repo>
```

For HTTP auth:

- username: your RevForge account email
- password: your RevForge personal access token

## 11. SSH setup for Mercurial

RevForge local SSH transport uses the `revforge-hg` SSH user and a forced-command gateway.

### Generate a key

#### macOS/Linux

```bash
ssh-keygen -t ed25519 -C "you@example.com"
```

#### Windows PowerShell

```powershell
ssh-keygen -t ed25519 -C "you@example.com"
```

#### Windows WSL2

```bash
ssh-keygen -t ed25519 -C "you@example.com"
```

### View the public key

#### macOS/Linux

```bash
cat ~/.ssh/id_ed25519.pub
```

#### Windows PowerShell

```powershell
Get-Content $HOME\.ssh\id_ed25519.pub
```

#### Windows WSL2

```bash
cat ~/.ssh/id_ed25519.pub
```

### Add the key to your RevForge account

1. Open RevForge in the browser.
2. Sign in.
3. Open account settings.
4. Add the contents of your public key file.

### Sync keys into the local SSH environment

#### macOS/Linux

```bash
make ssh-sync
```

Host-native backend equivalent:

```bash
make ssh-sync-host
```

#### Windows PowerShell

```powershell
docker compose -f infra/docker-compose.yml exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
```

Host-native backend equivalent:

```powershell
Push-Location backend
$env:REVFORGE_SSH_GATEWAY_COMMAND="/usr/local/bin/revforge-ssh-gateway"
.venv\Scripts\python.exe -m app.mercurial.authorized_keys
Pop-Location
```

#### Windows WSL2

```bash
make ssh-sync
```

Host-native backend equivalent:

```bash
make ssh-sync-host
```

### Check whether the SSH port is listening

#### macOS/Linux

```bash
nc -vz localhost 2222
```

#### Windows PowerShell

```powershell
Test-NetConnection localhost -Port 2222
```

#### Windows WSL2

```bash
nc -vz localhost 2222
```

### Test SSH authentication

#### macOS/Linux

```bash
ssh -p 2222 -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
```

#### Windows PowerShell

```powershell
ssh -p 2222 -i $HOME\.ssh\id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
```

#### Windows WSL2

```bash
ssh -p 2222 -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
```

### Clone over SSH

#### macOS/Linux

```bash
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```

#### Windows PowerShell

```powershell
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```

#### Windows WSL2

```bash
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```

### Important note about SSH keys

You do not need a different SSH key for every repository.

Normal flow:

- generate a key once on your machine
- add the public key once to your RevForge account
- reuse that same key across repositories your account can access

You only need another key when:

- you are using a different computer
- you rotate keys
- you intentionally separate work and personal identities

## 12. First-run validation workflow

1. Open `http://localhost:5173/register`
2. Create a user
3. Sign in
4. Create an organization
5. Create a repository
6. Provision the Mercurial repository if needed
7. Create a personal access token
8. Add an SSH public key
9. Run the SSH sync command for your setup
10. Test HTTP clone and SSH clone

HTTP clone:

```bash
hg clone http://localhost:8000/hg/<org>/<repo>
```

SSH clone:

```bash
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```

## 13. Common raw Docker commands

These commands are the same across macOS, Linux, Windows PowerShell, and Windows WSL2.

Start everything:

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

Start only infra services:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis sshd
```

Show status:

```bash
docker compose -f infra/docker-compose.yml ps
```

Show logs:

```bash
docker compose -f infra/docker-compose.yml logs -f --tail=200
```

Run backend migrations in Docker:

```bash
docker compose -f infra/docker-compose.yml exec -T backend python -m alembic upgrade head
```

Render managed SSH keys from the Docker backend:

```bash
docker compose -f infra/docker-compose.yml exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
```

Stop without deleting named volumes:

```bash
docker compose -f infra/docker-compose.yml down --remove-orphans
```

Stop and delete named volumes:

```bash
docker compose -f infra/docker-compose.yml down -v --remove-orphans
```

## 14. Troubleshooting

### `No module named pip`

Cause:

- the Python virtualenv exists, but `pip` was not bootstrapped into it

Fix on macOS/Linux:

```bash
make backend-sync
```

Fix on Windows PowerShell:

```powershell
py -3 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m ensurepip --upgrade
backend/.venv/Scripts/python.exe -m pip install --upgrade pip setuptools wheel
backend/.venv/Scripts/python.exe -m pip install -e ./backend
backend/.venv/Scripts/python.exe -m pip install pytest pytest-asyncio ruff mypy
```

Fix on Windows WSL2:

```bash
make backend-sync
```

### `docker compose ... up -d --build sshd` fails with `unknown docker command: "compose ..."`

Cause:

- `...` was typed literally

Correct command on all platforms:

```bash
docker compose -f infra/docker-compose.yml up -d --build sshd
```

### Frontend or backend changes do not show up in Docker

Cause:

- the current Docker workflow rebuilds images from source

Fix on all platforms:

```bash
docker compose -f infra/docker-compose.yml up -d --build frontend
docker compose -f infra/docker-compose.yml up -d --build backend worker
```

For faster iteration:

- run backend and frontend on the host
- keep only Postgres, Redis, and SSH in Docker

### Rebuilding Docker erased my data

Important clarification:

- rebuilding alone does not erase Postgres or Redis data
- `docker compose down --remove-orphans` keeps named volumes
- `docker compose down -v` removes named volumes and deletes the database data inside them

Safe stop command:

```bash
docker compose -f infra/docker-compose.yml down --remove-orphans
```

Destructive reset command:

```bash
docker compose -f infra/docker-compose.yml down -v --remove-orphans
```

### `ssh: connect to host localhost port 2222: Connection refused`

Check on macOS/Linux:

```bash
docker compose -f infra/docker-compose.yml ps
nc -vz localhost 2222
```

Check on Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml ps
Test-NetConnection localhost -Port 2222
```

Check on Windows WSL2:

```bash
docker compose -f infra/docker-compose.yml ps
nc -vz localhost 2222
```

Fix on all platforms:

```bash
docker compose -f infra/docker-compose.yml up -d --build sshd
```

### `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!`

Cause:

- the SSH server host key changed after a container rebuild
- your local `known_hosts` file still has the old key for `localhost:2222`

Fix on macOS/Linux:

```bash
ssh-keygen -R "[localhost]:2222"
ssh-keyscan -p 2222 localhost >> ~/.ssh/known_hosts
```

Fix on Windows PowerShell:

```powershell
ssh-keygen -R "[localhost]:2222"
ssh-keyscan -p 2222 localhost >> $HOME\.ssh\known_hosts
```

Fix on Windows WSL2:

```bash
ssh-keygen -R "[localhost]:2222"
ssh-keyscan -p 2222 localhost >> ~/.ssh/known_hosts
```

RevForge now persists local dev SSH host keys under the mounted SSH data directory so future rebuilds should not keep changing the host identity.

### `Permission denied (publickey)`

Cause:

- the public key was not added in RevForge
- the managed `authorized_keys` file was not regenerated
- SSH is offering the wrong key

Fix on macOS/Linux:

```bash
make ssh-sync
ssh -p 2222 -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
```

Fix on Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
ssh -p 2222 -i $HOME\.ssh\id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
```

Fix on Windows WSL2:

```bash
make ssh-sync
ssh -p 2222 -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
```

### `hg clone http://localhost:8000/hg/<org>/<repo>` works but SSH does not

Check on all platforms:

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml up -d --build sshd
docker compose -f infra/docker-compose.yml exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
```

Then retest SSH:

```bash
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```

### HTTPS keeps asking for username and password

Fix:

- use your RevForge account email as the username
- use a valid personal access token as the password
- clear stale cached credentials in your OS credential helper

### PostgreSQL or Redis port is already in use

Check on all platforms:

```bash
docker compose -f infra/docker-compose.yml ps
```

Fix:

- stop the conflicting service
- or change the published ports in `infra/docker-compose.yml`
- and keep `backend/.env` aligned if you run the backend on the host

### Backend fails to start because migrations are out of date

Fix on macOS/Linux:

```bash
make migrate
```

Fix on Windows PowerShell:

```powershell
Push-Location backend
.venv\Scripts\python.exe -m alembic upgrade head
Pop-Location
```

Fix on Windows WSL2:

```bash
make migrate
```

### `make frontend-install` fails

Check on macOS/Linux:

```bash
node --version
npm --version
```

Check on Windows PowerShell:

```powershell
node --version
npm --version
```

Check on Windows WSL2:

```bash
node --version
npm --version
```

Recommended Node versions:

- `20.x`
- `22.x`

## 15. Safe reset commands

### Stop containers but keep data

All platforms:

```bash
docker compose -f infra/docker-compose.yml down --remove-orphans
```

### Remove local dependency installs

macOS/Linux:

```bash
make clean
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force backend/.venv, frontend/node_modules, .cache
```

Windows WSL2:

```bash
make clean
```

### Full Docker reset including database data

All platforms:

```bash
docker compose -f infra/docker-compose.yml down -v --remove-orphans
```

Use that command carefully.

## 16. Suggested day-to-day workflows

### Full-stack validation

macOS/Linux:

```bash
make up
make ps
make logs
```

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f --tail=200
```

Windows WSL2:

```bash
make up
make ps
make logs
```

### Fast frontend and backend iteration

macOS/Linux:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis sshd
make backend-dev
make frontend-dev
```

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres redis sshd
Push-Location backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
Pop-Location
```

Open a second PowerShell window:

```powershell
Push-Location frontend
npm run dev -- --host 0.0.0.0 --port 5173
Pop-Location
```

Windows WSL2:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis sshd
make backend-dev
make frontend-dev
```

### SSH transport validation

macOS/Linux:

```bash
make up
make ssh-sync
ssh -p 2222 -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```

Windows PowerShell:

```powershell
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
docker compose -f infra/docker-compose.yml exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
ssh -p 2222 -i $HOME\.ssh\id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```

Windows WSL2:

```bash
make up
make ssh-sync
ssh -p 2222 -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes revforge-hg@localhost
hg clone ssh://revforge-hg@localhost:2222/<org>/<repo>
```
