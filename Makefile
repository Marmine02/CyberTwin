# CyberTwin developer tasks (Updated: 2026-11-17; on Windows use the commands in README.md directly).
.PHONY: install dev backend frontend test test-backend test-frontend lint e2e e2e-live screenshots build migrate docker-up docker-ollama clean

install:
	cd backend && uv sync
	cd frontend && npm install
	cd e2e && npm install && npx playwright install chromium

backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

dev:
	$(MAKE) -j2 backend frontend

migrate:
	cd backend && uv run alembic upgrade head

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest -m "not live" --cov --cov-report=term

test-frontend:
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app tests
	cd frontend && npx tsc --noEmit && npm run lint

e2e:
	cd e2e && npx playwright test demo-flow

e2e-live:
	cd e2e && E2E_AI_PROVIDER=ollama E2E_AI_MODEL=qwen2.5:7b E2E_AI_BASE_URL=http://localhost:11434 npx playwright test ai-live

screenshots:
	cd e2e && npx playwright test screenshots

build:
	cd frontend && npm run build && npm run check:secrets

docker-up:
	docker compose up --build

docker-ollama:
	docker compose --profile ollama up --build

clean:
	rm -f backend/cybertwin.db e2e/.e2e.db
