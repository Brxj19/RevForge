COMPOSE_FILE=infra/docker-compose.yml
UV_CACHE_DIR=$(CURDIR)/.cache/uv
NPM_CONFIG_CACHE=$(CURDIR)/.cache/npm
VENV_DIR=$(CURDIR)/backend/.venv
VENV_BIN=$(VENV_DIR)/bin
BACKEND_PORT=8000
FRONTEND_NODE_BIN=$(if $(wildcard /opt/homebrew/opt/node@22/bin/node),/opt/homebrew/opt/node@22/bin:,$(if $(wildcard /opt/homebrew/opt/node@23/bin/node),/opt/homebrew/opt/node@23/bin:,$(if $(wildcard /opt/homebrew/opt/node@20/bin/node),/opt/homebrew/opt/node@20/bin:,)))

.PHONY: up down backend-venv prepare backend-sync backend-dev frontend-install frontend-dev test lint format typecheck migrate migration

up:
	docker compose -f $(COMPOSE_FILE) up -d

down:
	docker compose -f $(COMPOSE_FILE) down

backend-venv:
	cd backend && if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
	cd backend && .venv/bin/python -m pip install --upgrade pip setuptools wheel
	cd backend && .venv/bin/python -m pip install -e . uv pytest pytest-asyncio ruff mypy

prepare:
	mkdir -p $(UV_CACHE_DIR) $(NPM_CONFIG_CACHE)

backend-sync: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv sync --group dev

backend-dev: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv run uvicorn app.main:app --reload --host 0.0.0.0 --port $(BACKEND_PORT)

frontend-install:
	cd frontend && PATH=$(FRONTEND_NODE_BIN)$$PATH NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm install

frontend-dev:
	cd frontend && PATH=$(FRONTEND_NODE_BIN)$$PATH NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run dev -- --host 0.0.0.0 --port 5173

test: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv run pytest
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run test

lint: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv run ruff check .
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run lint

format: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv run ruff format .
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run format

typecheck: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv run mypy app
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run typecheck

migrate: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv run alembic upgrade head

migration: backend-venv prepare
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) PATH=$(VENV_BIN):$$PATH uv run alembic revision --autogenerate -m "$(name)"
