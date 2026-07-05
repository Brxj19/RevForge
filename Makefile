COMPOSE_FILE=infra/docker-compose.yml
UV_CACHE_DIR=$(CURDIR)/.cache/uv
NPM_CONFIG_CACHE=$(CURDIR)/.cache/npm
FRONTEND_NODE_BIN=$(if $(wildcard /opt/homebrew/opt/node@22/bin/node),/opt/homebrew/opt/node@22/bin:,$(if $(wildcard /opt/homebrew/opt/node@20/bin/node),/opt/homebrew/opt/node@20/bin:,))

.PHONY: up down backend-sync backend-dev frontend-install frontend-dev test lint format typecheck migrate migration

up:
	docker compose -f $(COMPOSE_FILE) up -d

down:
	docker compose -f $(COMPOSE_FILE) down

backend-sync:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv sync --group dev

backend-dev:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-install:
	cd frontend && PATH=$(FRONTEND_NODE_BIN)$$PATH NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm install

frontend-dev:
	cd frontend && PATH=$(FRONTEND_NODE_BIN)$$PATH NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run dev -- --host 0.0.0.0 --port 5173

test:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv run pytest
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run test

lint:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv run ruff check .
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run lint

format:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv run ruff format .
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run format

typecheck:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv run mypy app
	cd frontend && NPM_CONFIG_CACHE=$(NPM_CONFIG_CACHE) npm run typecheck

migrate:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv run alembic upgrade head

migration:
	cd backend && UV_CACHE_DIR=$(UV_CACHE_DIR) uv run alembic revision --autogenerate -m "$(name)"
