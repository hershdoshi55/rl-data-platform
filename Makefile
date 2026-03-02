.PHONY: dev dev-infra dev-backend dev-frontend dev-worker migrate migrate-create seed test test-backend test-cov build up down logs clean

# ── Development ────────────────────────────────────────────────────────────────

## Start infrastructure only (Postgres + Redis via Docker)
dev-infra:
	docker compose -f docker-compose.dev.yml up -d
	@echo "Postgres: localhost:5432  |  Redis: localhost:6379"

## Start backend API with hot reload
dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8000

## Start Celery worker
dev-worker:
	cd backend && celery -A app.workers.celery_app worker --loglevel=info

## Start Celery beat scheduler
dev-beat:
	cd backend && celery -A app.workers.celery_app beat --loglevel=info

## Start frontend dev server
dev-frontend:
	cd frontend && npm run dev

## Full local dev: infra + backend + celery (requires tmux or run in separate terminals)
dev: dev-infra
	@echo ""
	@echo "Infrastructure started. Run these in separate terminals:"
	@echo "  make dev-backend    # FastAPI on :8000"
	@echo "  make dev-worker     # Celery worker"
	@echo "  make dev-frontend   # Vite on :5173"

# ── Database ────────────────────────────────────────────────────────────────────

## Run all pending migrations
migrate:
	cd backend && alembic upgrade head

## Create a new migration (usage: make migrate-create MSG="add column foo")
migrate-create:
	cd backend && alembic revision --autogenerate -m "$(MSG)"

## Downgrade one migration
migrate-down:
	cd backend && alembic downgrade -1

## Seed database with sample data
seed:
	cd backend && python -m scripts.seed_db

# ── Testing ─────────────────────────────────────────────────────────────────────

## Run all backend tests
test:
	cd backend && pytest -v

## Run a single test file (usage: make test-file FILE=app/tests/test_auth.py)
test-file:
	cd backend && pytest $(FILE) -v

## Run tests with coverage report
test-cov:
	cd backend && pytest --cov=app --cov-report=term-missing --cov-report=html

# ── Docker full stack ───────────────────────────────────────────────────────────

## Build all Docker images
build:
	docker compose build

## Start full stack (all services)
up:
	docker compose up -d

## Stop all services
down:
	docker compose down

## View logs (usage: make logs SVC=backend)
logs:
	docker compose logs -f $(SVC)

# ── Utilities ───────────────────────────────────────────────────────────────────

## Install backend dependencies
install-backend:
	cd backend && pip install -e ".[dev]"

## Install frontend dependencies
install-frontend:
	cd frontend && npm install

## Install all dependencies
install: install-backend install-frontend

## Copy .env.example to .env if .env doesn't exist
env:
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")

## Remove generated files and Docker volumes
clean:
	docker compose down -v
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find backend -name "*.pyc" -delete 2>/dev/null || true
	rm -rf frontend/dist frontend/node_modules/.vite
