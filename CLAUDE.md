# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RL Training Data Platform for LLM Agents — a full-stack web application for ML researchers to create RL training tasks, assign them to human annotators, collect structured reward signals and preference feedback, and export clean RLHF datasets. The PRD is the source of truth at `docs/rl_platform_prd.md`.

## Tech Stack

**Backend:** Python 3.11+, FastAPI 0.110+, SQLAlchemy 2.0+ (async with asyncpg), Alembic, Celery 5.3+, Redis 7.0+, python-jose + bcrypt (JWT + password hashing — **not passlib**, which is incompatible with bcrypt 4.x+), Pydantic 2.0+, pytest + httpx

**Frontend:** TypeScript 5.0+, React 18+, Vite 5.0+, Zustand 4.0+, Axios, React Router 6+, shadcn/ui + Tailwind CSS, React Hook Form + Zod, Monaco Editor, Recharts

**Infrastructure:** PostgreSQL 16+, Redis 7.0+, Docker + Docker Compose, Nginx, Prometheus + Grafana

## Project Structure

```
rl-data-platform/
├── backend/
│   ├── pyproject.toml
│   ├── alembic/
│   └── app/
│       ├── main.py          # FastAPI app factory
│       ├── config.py        # Settings from environment
│       ├── models/          # SQLAlchemy ORM models
│       ├── schemas/         # Pydantic request/response schemas
│       ├── api/             # Route handlers (auth, tasks, assignments, exports, metrics, admin)
│       ├── services/        # Business logic layer
│       ├── workers/         # Celery task definitions
│       ├── core/            # DB, Redis, security, exceptions, storage
│       ├── utils/           # Agreement metrics, formatters, validators
│       └── tests/
├── frontend/
│   ├── vite.config.ts
│   └── src/
│       ├── api/             # Axios client layer
│       ├── stores/          # Zustand stores (auth, tasks, UI)
│       ├── hooks/           # Custom React hooks
│       ├── components/      # Reusable UI components
│       ├── pages/           # Route-level page components
│       ├── routes/          # Router configuration
│       └── types/           # TypeScript definitions
├── monitoring/
│   ├── prometheus/
│   └── grafana/
├── scripts/                 # seed_db.py, generate_gold_tasks.py, export_to_s3.py
└── docs/
    └── rl_platform_prd.md
```

## Commands

```bash
# Start full stack (Docker services + backend + frontend + Celery)
make dev

# Backend only
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend only
cd frontend && npm run dev   # runs on port 5173

# Celery worker
cd backend && celery -A app.workers.celery_app worker

# Run all tests
make test
cd backend && pytest

# Run a single test file
cd backend && pytest app/tests/test_auth.py -v

# Run a single test by name
cd backend && pytest app/tests/test_tasks.py::test_create_task -v

# Database migrations
make migrate
cd backend && alembic upgrade head

# Create a new migration
cd backend && alembic revision --autogenerate -m "description"

# Frontend build
cd frontend && npm run build
```

## Architecture & Key Patterns

### Request Lifecycle
Task creation → queued in Redis sorted set (priority by difficulty + time) → annotator atomically pops via ZPOPMIN → submits response + reward signals → Celery workers compute quality metrics → researcher triggers export → Celery writes JSONL/Parquet to S3 or local storage.

### Backend Conventions

- **Async-first**: All FastAPI endpoints and database operations use `async/await`. Use `AsyncSession` from SQLAlchemy 2.0.
- **Pydantic V2 syntax**: Use `model_validator`, `field_validator`, `ConfigDict` — not V1 `validator` or `Config`.
- **SQLAlchemy 2.0 style**: Use `select()` statements and `Mapped[]` type annotations. Never use legacy `session.query()`.
- **Service layer**: Route handlers in `api/` call services in `services/`. Services raise custom exceptions from `app/core/exceptions.py`. Routes catch and convert to HTTP responses. Never expose raw SQLAlchemy/Redis exceptions.
- **Transaction boundaries**: Multi-row writes (e.g., response + reward_signal together) use `async with session.begin()`.
- **Atomic Redis queue ops**: Use `ZPOPMIN` for dequeue — never `ZRANGEBYSCORE` + `ZREM` as separate ops.
- **UUIDs**: All primary keys are UUID type in Postgres, serialized as strings in API responses.
- **FastAPI dependencies**: `get_db` for database sessions, `get_current_user()` and `@require_role("researcher")` decorators for auth.

### Frontend Conventions

- **State**: Zustand stores for auth (user, token), tasks (list, filters), UI (sidebar, theme).
- **API client**: Single Axios instance in `api/client.ts` with base URL, auth interceptor (auto-attach token, handle 401 refresh), and error normalization.
- **Custom hooks**: Wrap API calls + state updates (`useAuth`, `useTasks`, `useAssignment`, `useMetrics`). Keep pages thin.
- **Zod schemas**: Frontend form validation schemas mirror backend Pydantic schemas for consistency.
- **Protected routes**: `ProtectedRoute` component checks auth state + role before rendering pages.
- **Annotator UX**: Auto-save draft every 30 seconds; warn on `beforeunload` for unsaved changes.

### Authentication Flow
- JWT access tokens (30 min TTL) + refresh tokens (7 days TTL, rotated on use)
- On logout: blacklist token in Redis with TTL
- New users register with `role="pending"` — admin must approve before they can access the platform
- Roles: `admin > researcher > annotator > pending`

### Database Migration Rules
- Always backward-compatible: add columns as nullable first, backfill data, then add constraints in a subsequent migration.

### Testing
- Every endpoint needs a happy-path and at least one error test.
- Use `httpx.AsyncClient` with FastAPI test client (in-memory SQLite via aiosqlite).
- Fixtures in `conftest.py`: `admin_client`, `researcher_client`, `annotator_client` (pre-authenticated).
- **Mock Redis in tests**: the conftest patches `app.api.assignments.get_redis`, `app.api.tasks.get_redis`, `app.api.admin.get_redis` with a no-op async context manager, and patches `app.services.assignment_service.pop_from_queue` / `push_to_queue` and `app.services.task_service.push_to_queue` with `AsyncMock`.
- **Mock patch paths must match where a name is imported**, not where it is defined. E.g., patch `app.services.export_service.save_export_file`, not `app.core.storage.save_export_file`.
- **Test isolation**: the SQLite engine is session-scoped (shared across all tests). Seed test data with unique emails (`uuid.uuid4().hex`). Use `filters={"task_id": ...}` on export jobs to isolate export counts to one test's data.

### Celery Tasks
- Use exponential backoff: `max_retries=3`. Always update export job status on failure so UI reflects it.
- Periodic tasks (Celery beat): assignment expiry cleanup, quality metric computation.
