DEFAULT_GOAL := help

COMPOSE_FILE=infra/docker-compose.yml
NPM_CONFIG_CACHE=$(CURDIR)/.cache/npm
VENV_DIR=$(CURDIR)/backend/.venv
VENV_BIN=$(VENV_DIR)/bin
PYTHON_BIN=$(VENV_BIN)/python
BACKEND_BOOTSTRAP_STAMP=$(VENV_DIR)/.bootstrap-stamp
BACKEND_DEPS_STAMP=$(VENV_DIR)/.deps-stamp
FRONTEND_DEPS_STAMP=$(CURDIR)/frontend/node_modules/.install-stamp
BACKEND_DEV_DEPS=pytest pytest-asyncio ruff mypy
BACKEND_PORT=8000
FRONTEND_PORT=5173
FRONTEND_NODE_BIN=$(if $(wildcard /opt/homebrew/opt/node@22/bin/node),/opt/homebrew/opt/node@22/bin:,$(if $(wildcard /opt/homebrew/opt/node@23/bin/node),/opt/homebrew/opt/node@23/bin:,$(if $(wildcard /opt/homebrew/opt/node@20/bin/node),/opt/homebrew/opt/node@20/bin:,)))

.PHONY: help clean up down logs ps ssh-sync ssh-sync-host backend-venv prepare backend-sync backend-dev frontend-install frontend-dev test lint format typecheck migrate migration

help: ## Show available Make targets
	@awk 'BEGIN {FS = ":.*## "; printf "\nAvailable targets:\n\n"} /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-18s %s\n", $$1, $$2} END {printf "\n"}' $(MAKEFILE_LIST)

clean: ## Remove local dependency installs and caches
	rm -rf $(VENV_DIR) frontend/node_modules $(CURDIR)/.cache

up: ## Build and start the full Docker stack
	docker compose -f $(COMPOSE_FILE) up -d --build --remove-orphans

down: ## Stop the Docker stack
	docker compose -f $(COMPOSE_FILE) down --remove-orphans

logs: ## Follow Docker logs for the full stack
	docker compose -f $(COMPOSE_FILE) logs -f --tail=200

ps: ## Show Docker service status
	docker compose -f $(COMPOSE_FILE) ps

prepare: ## Create local cache directories
	mkdir -p $(NPM_CONFIG_CACHE)

$(BACKEND_BOOTSTRAP_STAMP): Makefile
	cd backend && if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
	cd backend && if ! .venv/bin/python -m pip --version >/dev/null 2>&1; then .venv/bin/python -m ensurepip --upgrade; fi
	cd backend && .venv/bin/python -m pip install --upgrade pip setuptools wheel
	touch $(BACKEND_BOOTSTRAP_STAMP)

backend-venv: $(BACKEND_BOOTSTRAP_STAMP) ## Create the backend virtualenv

$(BACKEND_DEPS_STAMP): backend/pyproject.toml Makefile | $(BACKEND_BOOTSTRAP_STAMP)
	cd backend && .venv/bin/python -m pip install -e .
	cd backend && .venv/bin/python -m pip install $(BACKEND_DEV_DEPS)
	touch $(BACKEND_DEPS_STAMP)

backend-sync: $(BACKEND_DEPS_STAMP) ## Install backend dependencies into the virtualenv

ssh-sync: ## Render SSH authorized_keys from the running Docker backend
	docker compose -f $(COMPOSE_FILE) exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys

ssh-sync-host: backend-sync ## Render SSH authorized_keys from the host backend environment
	cd backend && REVFORGE_SSH_GATEWAY_COMMAND=/usr/local/bin/revforge-ssh-gateway .venv/bin/python -m app.mercurial.authorized_keys

backend-dev: backend-sync ## Run the backend locally with reload
	cd backend && .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port $(BACKEND_PORT)

$(FRONTEND_DEPS_STAMP): frontend/package.json frontend/package-lock.json | prepare
	cd frontend && PATH=$(FRONTEND_NODE_BIN)$$PATH NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm install
	touch $(FRONTEND_DEPS_STAMP)

frontend-install: $(FRONTEND_DEPS_STAMP) ## Install frontend dependencies

frontend-dev: frontend-install ## Run the frontend locally
	cd frontend && PATH=$(FRONTEND_NODE_BIN)$$PATH NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run dev -- --host 0.0.0.0 --port $(FRONTEND_PORT)

test: backend-sync frontend-install ## Run backend and frontend tests
	cd backend && .venv/bin/python -m pytest
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run test

lint: backend-sync frontend-install ## Run backend and frontend linters
	cd backend && .venv/bin/python -m ruff check .
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run lint

format: backend-sync frontend-install ## Format backend and frontend code
	cd backend && .venv/bin/python -m ruff format .
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run format

typecheck: backend-sync frontend-install ## Run backend and frontend type checks
	cd backend && .venv/bin/python -m mypy app
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run typecheck

migrate: backend-sync ## Apply backend database migrations
	cd backend && .venv/bin/python -m alembic upgrade head

migration: backend-sync ## Create a new Alembic migration with name="<message>"
	cd backend && .venv/bin/python -m alembic revision --autogenerate -m "$(name)"
