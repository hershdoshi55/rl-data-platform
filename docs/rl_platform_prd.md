# Product Requirements Document: RL Training Data Platform for LLM Agents

## Document Metadata

- **Project Name:** RL Training Data Platform for LLM Agents
- **Author:** Hersh
- **Version:** 1.0
- **Date:** March 2026
- **Status:** Implementation Ready

---

## 1. Executive Summary

Build a full-stack web platform where ML researchers create reinforcement learning training tasks, assign them to human annotators, collect structured reward signals and preference feedback, monitor annotation quality in real-time, and export clean RLHF datasets for LLM fine-tuning. Think of it as an internal version of Scale AI / Label Studio purpose-built for RL workflows.

---

## 2. Complete Tech Stack

### Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Language | Python | 3.11+ | Backend application code |
| Framework | FastAPI | 0.110+ | Async REST API server |
| ORM | SQLAlchemy | 2.0+ | Database models and queries |
| Migrations | Alembic | 1.13+ | Database schema migrations |
| Task Queue | Celery | 5.3+ | Async background jobs (exports, batch ops) |
| Queue Broker | Redis | 7.0+ | Celery broker + task assignment queue + caching |
| Auth | python-jose + passlib | latest | JWT token generation + password hashing |
| Validation | Pydantic | 2.0+ | Request/response schema validation (built into FastAPI) |
| Testing | pytest + httpx | latest | Unit and integration tests |
| ASGI Server | uvicorn | latest | Production ASGI server |

### Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Language | TypeScript | 5.0+ | Type-safe frontend code |
| Framework | React | 18+ | UI component library |
| Build Tool | Vite | 5.0+ | Fast dev server and bundler |
| State Management | Zustand | 4.0+ | Lightweight global state |
| HTTP Client | Axios | 1.6+ | API communication |
| Routing | React Router | 6.0+ | Client-side routing |
| UI Components | shadcn/ui + Tailwind CSS | latest | Component library + utility styling |
| Forms | React Hook Form + Zod | latest | Form management + validation |
| Code Editor | Monaco Editor (@monaco-editor/react) | latest | In-browser code editing for coding tasks |
| Charts | Recharts | 2.0+ | Inline charts in dashboard |

### Database

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Primary DB | PostgreSQL | 16+ | All persistent application data |
| Cache/Queue | Redis | 7.0+ | Task queues, session cache, rate limiting |

### Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Containerization | Docker + Docker Compose | Local dev and deployment packaging |
| Reverse Proxy | Nginx | Serve frontend, proxy API requests |
| Monitoring | Prometheus | Metrics collection |
| Dashboards | Grafana | Metrics visualization |
| Cloud | AWS (ECS/Fargate or EC2) or GCP (Cloud Run) | Production deployment |
| Object Storage | AWS S3 or GCP Cloud Storage | Exported dataset file storage |

---

## 3. Complete System Design and Flow

### 3.1 High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Researcher   │  │ Annotator       │  │ Admin               │  │
│  │ Dashboard    │  │ Workspace       │  │ Panel               │  │
│  └──────┬──────┘  └───────┬─────────┘  └──────────┬──────────┘  │
│         └─────────────────┼──────────────────────-─┘             │
│                           │                                      │
│              React + TypeScript Frontend                         │
│              (Vite, Zustand, React Router)                       │
└───────────────────────────┼──────────────────────────────────────┘
                            │ HTTPS (JSON)
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                      Nginx Reverse Proxy                         │
│              / → Frontend static files                           │
│          /api → FastAPI backend (port 8000)                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                    FastAPI Backend                                │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐           │
│  │ Auth     │ │ Tasks    │ │ Feedback  │ │ Export   │           │
│  │ Module   │ │ Module   │ │ Module    │ │ Module   │           │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └────┬─────┘          │
│       │             │             │             │                 │
│  ┌────┴─────────────┴─────────────┴─────────────┴─────┐         │
│  │              SQLAlchemy ORM Layer                    │         │
│  └────────────────────────┬───────────────────────────-┘         │
│                           │                                      │
│  ┌────────────────────────┼───────────────────────────────┐      │
│  │          Celery Workers (Background Jobs)              │      │
│  │  • Dataset export (JSONL, preference pairs)            │      │
│  │  • Quality metric computation (inter-annotator agreement)│    │
│  │  • Batch task import                                   │      │
│  │  • Stale assignment cleanup                            │      │
│  └────────────────────────┼───────────────────────────────┘      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
     ┌───────▼───────┐ ┌───▼────┐  ┌──────▼──────┐
     │  PostgreSQL   │ │ Redis  │  │ S3/GCS      │
     │  (persistent  │ │ (queue │  │ (exported   │
     │   data store) │ │ broker │  │  datasets)  │
     │               │ │ cache) │  │             │
     └───────────────┘ └────────┘  └─────────────┘
             │
     ┌───────▼────────┐
     │  Prometheus     │──────▶ Grafana Dashboards
     │  (metrics)      │
     └────────────────-┘
```

### 3.2 Request Lifecycle — Task Creation to Dataset Export

```
Step 1: TASK CREATION
  Researcher → POST /api/tasks (or POST /api/tasks/bulk for CSV upload)
  → FastAPI validates payload via Pydantic schema
  → SQLAlchemy inserts into `tasks` table (status: "pending")
  → If auto_assign=true, tasks are pushed into Redis sorted set
    (score = priority level, member = task_id)

Step 2: TASK ASSIGNMENT
  Annotator → POST /api/assignments/next
  → Backend pops highest-priority task from Redis sorted set
  → Creates `assignments` row (status: "in_progress", deadline: now + timeout)
  → Returns task details + assignment_id to annotator
  → A Celery beat task runs every 5 minutes to check for expired assignments
    and return their tasks to the Redis queue

Step 3: ANNOTATION SUBMISSION
  Annotator → POST /api/assignments/{id}/submit
  → Payload includes: response content, reward scores, preference choice,
    dimension scores (JSONB), free-text justification
  → Backend validates all fields via Pydantic
  → Creates `responses` row and `reward_signals` row in a single transaction
  → Updates assignment status to "completed"
  → If task has required_annotations > current count, task stays in queue
  → If task has met annotation quota, update task status to "fully_annotated"

Step 4: QUALITY MONITORING
  → Celery periodic task runs every 15 minutes
  → For tasks with 2+ annotations, compute inter-annotator agreement
    (Cohen's kappa for binary, Krippendorff's alpha for ordinal)
  → Store computed metrics in `quality_metrics` table
  → Expose metrics to Prometheus endpoint for Grafana
  → Flag tasks with low agreement for researcher review

Step 5: DATASET EXPORT
  Researcher → POST /api/exports
  → Payload: filters (task_type, date_range, min_agreement_score),
    output_format ("jsonl", "preference_pairs", "huggingface"),
    quality_threshold (min agreement score to include)
  → Creates `export_jobs` row (status: "pending")
  → Dispatches Celery task to process export asynchronously
  → Celery worker queries filtered data, transforms to requested format,
    writes file to S3/local storage, updates job status to "completed"
  → Researcher polls GET /api/exports/{id} or receives webhook
  → Downloads file from GET /api/exports/{id}/download
```

### 3.3 Authentication and Authorization Flow

```
REGISTRATION:
  POST /api/auth/register
  → Payload: email, password, requested_role
  → Hash password with bcrypt (passlib)
  → Create user with role="pending" (admin must approve role)
  → Return user_id

LOGIN:
  POST /api/auth/login
  → Validate credentials
  → Generate JWT access token (expires: 30 min) + refresh token (expires: 7 days)
  → Return tokens

AUTHORIZATION:
  Every protected endpoint uses a FastAPI dependency: get_current_user()
  → Extracts JWT from Authorization header
  → Decodes and validates token
  → Returns user object with role
  → Role-based decorators: @require_role("researcher"), @require_role("annotator")

ROLE PERMISSIONS:
  admin:      All operations, user management, system config
  researcher: Create/edit tasks, view all data, trigger exports, view metrics
  annotator:  View assigned tasks only, submit feedback only
```

### 3.4 Database Schema Design (Complete)

```sql
-- USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'researcher', 'annotator', 'pending')),
    display_name VARCHAR(100),
    skills JSONB DEFAULT '[]',           -- e.g., ["python", "reasoning", "math"]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PROJECTS TABLE (groups of related tasks)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    config JSONB DEFAULT '{}',           -- project-level settings
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TASKS TABLE
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('coding', 'reasoning', 'open_ended', 'preference_comparison', 'safety_evaluation')),
    prompt TEXT NOT NULL,
    reference_solution TEXT,             -- optional gold answer
    metadata JSONB DEFAULT '{}',         -- flexible: tags, difficulty, context, etc.
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5),
    required_annotations INTEGER DEFAULT 1,
    completed_annotations INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'in_progress', 'fully_annotated', 'archived')),
    is_gold BOOLEAN DEFAULT false,       -- gold/calibration task
    gold_answer JSONB,                   -- expected answer for gold tasks
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TASK VERSIONS TABLE (tracks prompt changes)
CREATE TABLE task_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    reference_solution TEXT,
    metadata JSONB,
    changed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (task_id, version_number)
);

-- ASSIGNMENTS TABLE
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    annotator_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'expired', 'skipped')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    deadline TIMESTAMPTZ NOT NULL,       -- auto-set: assigned_at + timeout
    started_at TIMESTAMPTZ,              -- when annotator actually starts working
    completed_at TIMESTAMPTZ,
    time_spent_seconds INTEGER           -- tracked from started_at to completed_at
);

-- RESPONSES TABLE
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id),
    annotator_id UUID REFERENCES users(id),
    content TEXT NOT NULL,               -- annotator's actual response text/code
    content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'code', 'structured')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REWARD SIGNALS TABLE
CREATE TABLE reward_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID REFERENCES responses(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id),
    annotator_id UUID REFERENCES users(id),

    -- Core reward signal
    overall_score FLOAT CHECK (overall_score BETWEEN 1.0 AND 7.0),

    -- Preference comparison (for tasks comparing two model outputs)
    preference_choice VARCHAR(10) CHECK (preference_choice IN ('A', 'B', 'tie', NULL)),
    preference_strength INTEGER CHECK (preference_strength BETWEEN 1 AND 3),  -- 1=slight, 2=moderate, 3=strong

    -- Dimension-specific scores (flexible via JSONB)
    dimension_scores JSONB DEFAULT '{}',
    -- Example: {"helpfulness": 5, "correctness": 6, "safety": 7, "coherence": 5}

    -- Justification
    justification TEXT,                  -- free-text explanation of ratings

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QUALITY METRICS TABLE (computed periodically)
CREATE TABLE quality_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id),
    metric_type VARCHAR(50) NOT NULL,    -- 'cohens_kappa', 'krippendorff_alpha', 'agreement_pct'
    metric_value FLOAT NOT NULL,
    sample_size INTEGER,                 -- number of annotations used
    computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANNOTATOR PERFORMANCE TABLE (computed periodically)
CREATE TABLE annotator_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annotator_id UUID REFERENCES users(id),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    tasks_completed INTEGER DEFAULT 0,
    avg_time_seconds FLOAT,
    gold_task_accuracy FLOAT,            -- % correct on gold/calibration tasks
    agreement_with_peers FLOAT,          -- avg agreement score with other annotators
    computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- EXPORT JOBS TABLE
CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    output_format VARCHAR(30) NOT NULL CHECK (output_format IN ('jsonl', 'preference_pairs', 'huggingface', 'csv')),
    filters JSONB NOT NULL,              -- {"task_type": "coding", "min_agreement": 0.7, "project_id": "..."}
    quality_threshold FLOAT DEFAULT 0.0,
    file_path VARCHAR(500),              -- S3 URL or local path to generated file
    file_size_bytes BIGINT,
    record_count INTEGER,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(task_type);
CREATE INDEX idx_tasks_is_gold ON tasks(is_gold);
CREATE INDEX idx_assignments_annotator_id ON assignments(annotator_id);
CREATE INDEX idx_assignments_task_id ON assignments(task_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_deadline ON assignments(deadline);
CREATE INDEX idx_responses_task_id ON responses(task_id);
CREATE INDEX idx_reward_signals_task_id ON reward_signals(task_id);
CREATE INDEX idx_quality_metrics_task_id ON quality_metrics(task_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_annotator_performance_annotator ON annotator_performance(annotator_id);
```

---

## 4. Project File Structure

```
rl-training-platform/
├── docker-compose.yml                   # Full stack orchestration
├── docker-compose.dev.yml               # Dev overrides (hot reload, debug)
├── .env.example                         # Template for environment variables
├── .gitignore
├── README.md
├── Makefile                             # Common commands (make dev, make test, make migrate)
│
├── backend/
│   ├── Dockerfile                       # Python 3.11-slim, install deps, run uvicorn
│   ├── pyproject.toml                   # Python dependencies and project config
│   ├── alembic.ini                      # Alembic migration configuration
│   ├── alembic/
│   │   ├── env.py                       # Alembic environment setup, imports Base metadata
│   │   ├── script.py.mako               # Migration template
│   │   └── versions/                    # Generated migration files
│   │       └── 001_initial_schema.py    # First migration with all tables above
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                      # FastAPI app factory, CORS, middleware, include routers
│   │   ├── config.py                    # Settings class using pydantic-settings, reads from env
│   │   ├── dependencies.py              # FastAPI dependencies: get_db, get_current_user, require_role
│   │   │
│   │   ├── models/                      # SQLAlchemy ORM models (map to DB tables above)
│   │   │   ├── __init__.py              # Import and export all models, define Base
│   │   │   ├── user.py                  # User model: id, email, password_hash, role, skills
│   │   │   ├── project.py               # Project model: id, name, description, config
│   │   │   ├── task.py                  # Task model: id, type, prompt, status, metadata, is_gold
│   │   │   ├── task_version.py          # TaskVersion model: tracks prompt changes over time
│   │   │   ├── assignment.py            # Assignment model: task_id, annotator_id, status, deadline
│   │   │   ├── response.py              # Response model: assignment_id, content, content_type
│   │   │   ├── reward_signal.py         # RewardSignal: scores, preference, dimension_scores (JSONB)
│   │   │   ├── quality_metric.py        # QualityMetric: task_id, metric_type, metric_value
│   │   │   ├── annotator_performance.py # AnnotatorPerformance: computed stats per annotator
│   │   │   └── export_job.py            # ExportJob: status, format, filters, file_path
│   │   │
│   │   ├── schemas/                     # Pydantic schemas for request/response validation
│   │   │   ├── __init__.py
│   │   │   ├── auth.py                  # LoginRequest, RegisterRequest, TokenResponse, UserResponse
│   │   │   ├── task.py                  # TaskCreate, TaskUpdate, TaskResponse, TaskBulkUpload
│   │   │   ├── assignment.py            # AssignmentResponse, AssignmentSubmit
│   │   │   ├── response.py              # ResponseCreate, ResponseResponse
│   │   │   ├── reward_signal.py         # RewardSignalCreate, RewardSignalResponse, DimensionScores
│   │   │   ├── export_job.py            # ExportCreate, ExportResponse, ExportFilters
│   │   │   ├── project.py               # ProjectCreate, ProjectResponse
│   │   │   └── metrics.py               # QualityMetricResponse, AnnotatorStatsResponse, DashboardStats
│   │   │
│   │   ├── api/                         # Route handlers organized by domain
│   │   │   ├── __init__.py
│   │   │   ├── auth.py                  # POST /register, POST /login, POST /refresh, GET /me
│   │   │   ├── tasks.py                 # CRUD: GET/POST/PUT/DELETE /tasks, POST /tasks/bulk
│   │   │   ├── assignments.py           # POST /assignments/next, POST /assignments/{id}/submit, POST /assignments/{id}/skip
│   │   │   ├── projects.py              # CRUD: GET/POST/PUT/DELETE /projects
│   │   │   ├── exports.py               # POST /exports, GET /exports/{id}, GET /exports/{id}/download
│   │   │   ├── metrics.py               # GET /metrics/dashboard, GET /metrics/annotators/{id}, GET /metrics/tasks/{id}
│   │   │   └── admin.py                 # GET/PUT /admin/users, PUT /admin/users/{id}/role, system health
│   │   │
│   │   ├── services/                    # Business logic layer (called by API routes)
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py          # Password hashing, JWT creation/validation, user lookup
│   │   │   ├── task_service.py          # Task CRUD, bulk import parsing, version tracking
│   │   │   ├── assignment_service.py    # Queue management, task pop from Redis, expiry logic
│   │   │   ├── feedback_service.py      # Reward signal creation, gold task validation
│   │   │   ├── export_service.py        # Dataset transformation: JSONL, preference pairs, HF format
│   │   │   ├── quality_service.py       # Inter-annotator agreement computation, annotator performance
│   │   │   └── metrics_service.py       # Dashboard stats aggregation, Prometheus metric exposure
│   │   │
│   │   ├── workers/                     # Celery task definitions
│   │   │   ├── __init__.py
│   │   │   ├── celery_app.py            # Celery app configuration, broker URL, result backend
│   │   │   ├── export_tasks.py          # process_export(job_id): query, transform, write to S3
│   │   │   ├── quality_tasks.py         # compute_quality_metrics(): periodic agreement calculation
│   │   │   ├── assignment_tasks.py      # cleanup_expired_assignments(): return tasks to queue
│   │   │   └── import_tasks.py          # process_bulk_import(file_path): parse CSV/JSON, create tasks
│   │   │
│   │   ├── core/                        # Cross-cutting utilities
│   │   │   ├── __init__.py
│   │   │   ├── database.py              # SQLAlchemy engine, SessionLocal, get_db generator
│   │   │   ├── redis_client.py          # Redis connection pool, helper functions for queue ops
│   │   │   ├── security.py              # JWT encode/decode, password hashing helpers
│   │   │   ├── exceptions.py            # Custom exception classes + FastAPI exception handlers
│   │   │   └── storage.py               # S3/GCS file upload/download abstraction
│   │   │
│   │   └── utils/                       # Pure utility functions
│   │       ├── __init__.py
│   │       ├── agreement.py             # Cohen's kappa, Krippendorff's alpha implementations
│   │       ├── formatters.py            # Dataset format converters (JSONL, preference pairs)
│   │       └── validators.py            # Custom validation helpers (task prompt checks, etc.)
│   │
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py                  # Fixtures: test DB, test client, auth tokens, sample data
│       ├── test_auth.py                 # Registration, login, token refresh, role checks
│       ├── test_tasks.py                # Task CRUD, bulk upload, versioning
│       ├── test_assignments.py          # Queue behavior, expiry, submission
│       ├── test_feedback.py             # Reward signal creation, gold task scoring
│       ├── test_exports.py              # Export format correctness, filter application
│       ├── test_quality.py              # Agreement metric calculations
│       └── test_services/               # Unit tests for service layer
│           ├── test_auth_service.py
│           ├── test_task_service.py
│           └── test_export_service.py
│
├── frontend/
│   ├── Dockerfile                       # Node 20-alpine, npm install, npm run build, serve with nginx
│   ├── nginx.conf                       # Frontend nginx config: serve static, proxy /api to backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts                   # Vite config: proxy /api to localhost:8000 in dev
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   │
│   └── src/
│       ├── main.tsx                     # React entry point, mount App
│       ├── App.tsx                      # Root component: AuthProvider, Router, Layout
│       ├── vite-env.d.ts
│       │
│       ├── api/                         # API client layer
│       │   ├── client.ts                # Axios instance: base URL, auth interceptor, error handling
│       │   ├── auth.ts                  # login(), register(), refreshToken(), getMe()
│       │   ├── tasks.ts                 # getTasks(), createTask(), updateTask(), bulkUpload()
│       │   ├── assignments.ts           # getNextAssignment(), submitAssignment(), skipAssignment()
│       │   ├── exports.ts               # createExport(), getExportStatus(), downloadExport()
│       │   ├── metrics.ts               # getDashboardStats(), getAnnotatorStats(), getTaskMetrics()
│       │   └── admin.ts                 # getUsers(), updateUserRole(), getSystemHealth()
│       │
│       ├── stores/                      # Zustand state stores
│       │   ├── authStore.ts             # user, token, login(), logout(), isAuthenticated
│       │   ├── taskStore.ts             # tasks[], filters, pagination, selectedTask
│       │   └── uiStore.ts              # sidebar state, theme, notifications queue
│       │
│       ├── hooks/                       # Custom React hooks
│       │   ├── useAuth.ts               # Wraps authStore, handles token refresh
│       │   ├── useTasks.ts              # Data fetching + caching for tasks list
│       │   ├── useAssignment.ts         # Current assignment state, timer, submission
│       │   └── useMetrics.ts            # Dashboard polling, auto-refresh
│       │
│       ├── components/                  # Reusable UI components
│       │   ├── ui/                      # shadcn/ui primitives (Button, Card, Dialog, Table, etc.)
│       │   ├── Layout/
│       │   │   ├── Sidebar.tsx          # Navigation sidebar: role-based menu items
│       │   │   ├── Header.tsx           # Top bar: user avatar, notifications, logout
│       │   │   └── MainLayout.tsx       # Sidebar + Header + content area wrapper
│       │   ├── TaskCard.tsx             # Task preview card: type badge, difficulty, status
│       │   ├── RewardForm.tsx           # Structured feedback form: sliders, radio buttons, text
│       │   ├── CodeEditor.tsx           # Monaco editor wrapper for coding tasks
│       │   ├── ExportDialog.tsx         # Export configuration modal: format, filters, threshold
│       │   ├── MetricsChart.tsx         # Recharts wrapper for dashboard charts
│       │   ├── DataTable.tsx            # Generic sortable/filterable table component
│       │   ├── ProtectedRoute.tsx       # Route guard: checks auth + role
│       │   └── LoadingSpinner.tsx       # Shared loading indicator
│       │
│       ├── pages/                       # Route-level page components
│       │   ├── auth/
│       │   │   ├── LoginPage.tsx        # Email + password form, "Register" link
│       │   │   └── RegisterPage.tsx     # Registration form with role selection
│       │   ├── researcher/
│       │   │   ├── DashboardPage.tsx    # Overview: task counts, quality trends, recent activity
│       │   │   ├── TaskListPage.tsx     # Paginated table of all tasks with filters
│       │   │   ├── TaskCreatePage.tsx   # Task creation form: type selector, prompt editor, config
│       │   │   ├── TaskDetailPage.tsx   # Single task view: all annotations, quality metrics, versions
│       │   │   ├── BulkUploadPage.tsx   # CSV/JSON file upload interface with preview
│       │   │   ├── ExportPage.tsx       # Export configuration and job history
│       │   │   └── MetricsPage.tsx      # Full metrics dashboard: charts, annotator leaderboard
│       │   ├── annotator/
│       │   │   ├── WorkspacePage.tsx     # Main annotation interface: task + response + feedback form
│       │   │   ├── QueuePage.tsx        # View of available tasks in queue (optional)
│       │   │   └── HistoryPage.tsx      # Annotator's own completed work
│       │   └── admin/
│       │       ├── UserManagementPage.tsx # User list, role editing, activation/deactivation
│       │       └── SystemPage.tsx       # System health, Redis queue depth, worker status
│       │
│       ├── routes/                      # Route configuration
│       │   └── index.tsx                # React Router route definitions, role-based guards
│       │
│       ├── types/                       # TypeScript type definitions
│       │   ├── api.ts                   # API response types matching Pydantic schemas
│       │   ├── models.ts               # Frontend domain models (Task, Assignment, User, etc.)
│       │   └── enums.ts                # TaskType, TaskStatus, UserRole, ExportFormat enums
│       │
│       └── utils/                       # Frontend utilities
│           ├── constants.ts             # API URLs, task types, difficulty labels
│           ├── formatters.ts            # Date formatting, score display helpers
│           └── validators.ts            # Form validation schemas (Zod)
│
├── monitoring/
│   ├── prometheus/
│   │   └── prometheus.yml               # Scrape config: backend /metrics endpoint, node exporter
│   ├── grafana/
│   │   ├── provisioning/
│   │   │   ├── dashboards/
│   │   │   │   └── dashboards.yml       # Dashboard provisioning config
│   │   │   └── datasources/
│   │   │       └── datasources.yml      # Prometheus datasource auto-config
│   │   └── dashboards/
│   │       ├── annotation_overview.json  # Main dashboard: throughput, queue depth, quality
│   │       └── annotator_detail.json     # Per-annotator dashboard: speed, accuracy, agreement
│   │
│   └── docker-compose.monitoring.yml     # Prometheus + Grafana containers
│
├── scripts/
│   ├── seed_db.py                       # Seed database with sample users, tasks, projects
│   ├── generate_gold_tasks.py           # Generate calibration tasks from reference datasets
│   └── export_to_s3.py                  # Manual export utility for one-off dataset pushes
│
└── docs/
    ├── api.md                           # API endpoint documentation
    ├── deployment.md                    # Deployment guide for AWS/GCP
    └── annotator_guide.md              # Guide for annotators using the platform
```

---

## 5. Setup Steps (Dependencies and Database)

### 5.1 Prerequisites

An AI agent or developer must have installed:
- Docker and Docker Compose (v2+)
- Node.js 20+ and npm
- Python 3.11+
- Git

### 5.2 Step-by-Step Local Setup

```
STEP 1: INITIALIZE PROJECT
  mkdir rl-training-platform && cd rl-training-platform
  git init
  Create .env file from .env.example with these variables:
    DATABASE_URL=postgresql://rluser:rlpass@localhost:5432/rlplatform
    REDIS_URL=redis://localhost:6379/0
    SECRET_KEY=<generate with: openssl rand -hex 32>
    ACCESS_TOKEN_EXPIRE_MINUTES=30
    REFRESH_TOKEN_EXPIRE_DAYS=7
    S3_BUCKET=rl-exports (or local path for dev)
    ENVIRONMENT=development

STEP 2: DOCKER COMPOSE FOR INFRASTRUCTURE
  Create docker-compose.yml with services:
    - postgres: image postgres:16, port 5432, volume for data persistence
    - redis: image redis:7-alpine, port 6379
  Run: docker compose up -d postgres redis

STEP 3: BACKEND SETUP
  cd backend
  Create pyproject.toml with dependencies:
    fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg,
    alembic, pydantic, pydantic-settings, python-jose[cryptography],
    passlib[bcrypt], celery[redis], redis, boto3,
    httpx (for testing), pytest, pytest-asyncio
  Create virtual environment: python -m venv venv && source venv/bin/activate
  Install: pip install -e ".[dev]"

STEP 4: DATABASE INITIALIZATION
  Initialize Alembic: alembic init alembic
  Configure alembic/env.py to import your Base and read DATABASE_URL from config
  Create initial migration: alembic revision --autogenerate -m "initial_schema"
  Run migration: alembic upgrade head

STEP 5: REDIS VERIFICATION
  python -c "import redis; r = redis.Redis(); r.ping(); print('Redis OK')"

STEP 6: FRONTEND SETUP
  cd ../frontend
  npm create vite@latest . -- --template react-ts
  npm install
  npm install axios zustand react-router-dom @tanstack/react-query
  npm install -D tailwindcss postcss autoprefixer @types/node
  npx tailwindcss init -p
  Install shadcn/ui: npx shadcn-ui@latest init

STEP 7: VERIFY FULL STACK
  Terminal 1: cd backend && uvicorn app.main:app --reload --port 8000
  Terminal 2: cd frontend && npm run dev
  Terminal 3: docker compose up -d (postgres + redis already running)
  Terminal 4: cd backend && celery -A app.workers.celery_app worker --loglevel=info
  Visit http://localhost:5173 (frontend)
  Visit http://localhost:8000/docs (FastAPI Swagger UI)
```

---

## 6. Phase 1: Minimum Viable Product (MVP)

### 6.1 MVP Scope Definition

The MVP delivers the core annotation loop: create tasks, assign them, collect feedback, and export data. No Grafana, no multi-annotator agreement, no gold tasks. Keep it simple.

### 6.2 MVP Implementation Order (Step by Step)

```
SPRINT 1 (Days 1-3): FOUNDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Project scaffolding: create entire directory structure as defined above
  2. Docker Compose: postgres + redis services
  3. Backend skeleton:
     - app/main.py: FastAPI app with CORS middleware
     - app/config.py: Settings class reading from .env
     - app/core/database.py: SQLAlchemy async engine + session factory
     - app/core/redis_client.py: Redis connection pool
  4. Database models (ALL of them — models are cheap, build the full schema):
     - All models in app/models/ as defined in schema section
     - Alembic initial migration
  5. Pydantic schemas for auth + tasks
  6. Verify: FastAPI docs page loads, DB connects, migration runs

SPRINT 2 (Days 4-6): AUTH + USER MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. app/core/security.py:
     - create_access_token(data: dict) → JWT string
     - create_refresh_token(data: dict) → JWT string
     - verify_token(token: str) → payload dict
     - hash_password(password: str) → hashed string
     - verify_password(plain: str, hashed: str) → bool
  2. app/services/auth_service.py:
     - register_user(email, password, role) → User
     - authenticate_user(email, password) → User or None
     - get_user_by_id(user_id) → User
  3. app/dependencies.py:
     - get_db(): yields DB session
     - get_current_user(): extracts + validates JWT → returns User
     - require_role(role): checks user.role == role, raises 403 if not
  4. app/api/auth.py:
     - POST /api/auth/register: create user
     - POST /api/auth/login: return access + refresh tokens
     - POST /api/auth/refresh: exchange refresh token for new access token
     - GET /api/auth/me: return current user info
  5. Test: register user, login, use token to access /me

SPRINT 3 (Days 7-10): TASK MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. app/services/task_service.py:
     - create_task(data: TaskCreate, user_id) → Task
       Creates task row, if status is "queued" push task_id to Redis sorted set
     - get_tasks(filters, pagination) → list[Task]
       Support filtering by: project_id, task_type, status, difficulty
       Support pagination: page, page_size, sort_by, sort_order
     - get_task(task_id) → Task with related annotations
     - update_task(task_id, data: TaskUpdate) → Task
       On prompt change: increment version, create task_versions row
     - delete_task(task_id) → None (soft delete: set status to 'archived')
     - bulk_create_tasks(file_contents: list[dict]) → list[Task]
       Parse CSV/JSON rows, validate each, create in batch
  2. app/api/tasks.py:
     - GET /api/tasks: list tasks (researcher only)
     - POST /api/tasks: create single task (researcher only)
     - GET /api/tasks/{id}: get task detail (researcher only)
     - PUT /api/tasks/{id}: update task (researcher only)
     - DELETE /api/tasks/{id}: archive task (researcher only)
     - POST /api/tasks/bulk: upload CSV/JSON file (researcher only)
  3. app/api/projects.py:
     - Standard CRUD for projects (researcher only)
  4. Queue integration:
     - When task is created with auto_queue=true, push to Redis sorted set:
       ZADD task_queue {priority_score} {task_id}
     - Priority score = difficulty * 10 + (created_at_timestamp % 10000)
       (higher difficulty = higher priority, tiebreak by creation time)

SPRINT 4 (Days 11-14): ASSIGNMENT + ANNOTATION FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. app/services/assignment_service.py:
     - get_next_assignment(annotator_id) → Assignment + Task
       ZPOPMIN from task_queue Redis sorted set → get task_id
       Check annotator hasn't already annotated this task
       Create assignment row (deadline = now + 30 min default)
       Return assignment with full task data
     - submit_assignment(assignment_id, response_data, reward_data) → Response + RewardSignal
       Validate assignment belongs to annotator and is not expired
       Create response row and reward_signal row in single DB transaction
       Update assignment: status='completed', completed_at=now, time_spent_seconds
       Increment task.completed_annotations
       If task.completed_annotations >= task.required_annotations:
         Set task.status = 'fully_annotated'
     - skip_assignment(assignment_id) → None
       Set assignment status='skipped', return task to Redis queue
     - Internal: cleanup_expired_assignments()
       Query assignments WHERE status='assigned' AND deadline < now
       Set status='expired', push task_id back to Redis queue
  2. app/api/assignments.py:
     - POST /api/assignments/next: get next task (annotator only)
     - POST /api/assignments/{id}/submit: submit work (annotator only)
     - POST /api/assignments/{id}/skip: skip task (annotator only)
     - GET /api/assignments/history: annotator's past work (annotator only)
  3. Celery beat task:
     - Every 5 minutes: run cleanup_expired_assignments()

SPRINT 5 (Days 15-18): BASIC EXPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. app/services/export_service.py:
     - create_export_job(filters, format, user_id) → ExportJob
     - process_export(job_id):
       Query all reward_signals + responses matching filters
       Apply quality_threshold filter if set
       Transform to requested format:
         JSONL: one JSON object per annotation
           {"task_id": "...", "prompt": "...", "response": "...", "score": 5.0, "dimensions": {...}}
         Preference pairs: for preference_comparison tasks
           {"prompt": "...", "chosen": "...", "rejected": "...", "preference_strength": 2}
         HuggingFace: compatible with trl library
           {"prompt": "...", "chosen": "...", "rejected": "..."}
       Write to file (local in MVP, S3 in production)
       Update export_job: status='completed', file_path, record_count, file_size
  2. app/workers/export_tasks.py:
     - Celery task that calls process_export(job_id)
  3. app/api/exports.py:
     - POST /api/exports: create export job (researcher only) → triggers Celery task
     - GET /api/exports: list all export jobs
     - GET /api/exports/{id}: get job status
     - GET /api/exports/{id}/download: download file (if completed)

SPRINT 6 (Days 19-24): FRONTEND MVP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Auth pages (Days 19-20):
     - LoginPage.tsx: email/password form, calls POST /api/auth/login
     - RegisterPage.tsx: registration form
     - authStore.ts: store token, user info, handle refresh
     - ProtectedRoute.tsx: redirect to login if no token, check role
     - App.tsx: wrap in AuthProvider, set up routes

  2. Researcher pages (Days 20-22):
     - DashboardPage.tsx:
       Display: total tasks, tasks by status (pending/queued/completed),
       total annotations, recent activity list
     - TaskListPage.tsx:
       DataTable with columns: ID, Type, Difficulty, Status, Annotations, Created
       Filters: type dropdown, status dropdown, search by prompt text
       Pagination: page selector, page size
     - TaskCreatePage.tsx:
       Form fields: task_type (dropdown), prompt (textarea/Monaco for coding),
       reference_solution (optional textarea), difficulty (1-5 slider),
       required_annotations (number), project (dropdown), auto_queue (toggle)
     - TaskDetailPage.tsx:
       Show prompt, all annotations, individual reward signals
     - ExportPage.tsx:
       ExportDialog with: format selector, task type filter, date range,
       quality threshold slider. Shows export job history table.

  3. Annotator pages (Days 22-24):
     - WorkspacePage.tsx (CRITICAL — this is where annotators spend all time):
       Flow: click "Get Next Task" → calls POST /assignments/next
       → displays task prompt (use Monaco editor if coding task)
       → annotator writes response in text area or code editor
       → RewardForm.tsx: overall score slider (1-7), dimension score sliders,
         justification text area
       → Submit button calls POST /assignments/{id}/submit
       → Shows success, loads next task
       Include: countdown timer showing deadline, skip button
     - HistoryPage.tsx: table of annotator's past submissions

  4. Shared components:
     - Sidebar.tsx: researcher sees Tasks/Export/Metrics, annotator sees Workspace/History
     - Header.tsx: user name, role badge, logout button

SPRINT 7 (Days 25-27): INTEGRATION + TESTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Write backend tests:
     - conftest.py: test database (SQLite or test Postgres), test client fixture
     - Test auth flow: register → login → access protected route
     - Test task CRUD: create → list → update → archive
     - Test assignment flow: create task → queue → assign → submit → check completion
     - Test export: create tasks + annotations → export → verify format
  2. Frontend integration testing:
     - Manual test full flow: login → create task → switch user → annotate → export
  3. Docker Compose full stack:
     - Test docker compose up builds and runs everything
     - Seed database with sample data via scripts/seed_db.py
```

---

## 7. Phase 2: Features and Refinements

### 7.1 Quality System (Days 28-32)

```
GOLD TASKS:
  - Add is_gold flag and gold_answer to task creation UI
  - When annotator submits gold task, auto-compare against gold_answer
  - Store accuracy per annotator in annotator_performance table
  - Researcher configures gold task frequency: e.g., 1 in every 10 assignments
  - In assignment_service.get_next_assignment():
    gold_counter = redis.incr(f"annotator:{id}:task_count")
    if gold_counter % gold_frequency == 0:
      return random gold task instead of queue pop

INTER-ANNOTATOR AGREEMENT:
  - app/utils/agreement.py:
    - cohens_kappa(ratings_a, ratings_b) → float
      For binary/categorical comparisons between two annotators
    - krippendorff_alpha(ratings_matrix) → float
      For ordinal scores with multiple annotators
    - percent_agreement(ratings_list) → float
      Simple pairwise agreement percentage
  - Celery periodic task (every 15 min):
    Query tasks with 2+ completed annotations
    Compute agreement metrics, store in quality_metrics table
  - Surface in researcher dashboard:
    Overall platform agreement score
    Per-task agreement (flag tasks with kappa < 0.4 as "needs review")
    Per-annotator agreement with peers

ANNOTATOR PERFORMANCE TRACKING:
  - Celery daily task: compute per-annotator stats
    tasks_completed (count), avg_time_seconds, gold_task_accuracy,
    agreement_with_peers
  - Researcher can view annotator leaderboard in MetricsPage
  - Auto-flag annotators with gold accuracy < 60% for review
```

### 7.2 Monitoring with Prometheus + Grafana (Days 33-35)

```
PROMETHEUS METRICS (expose at GET /api/metrics/prometheus):
  - rl_tasks_total (counter, labels: type, status)
  - rl_assignments_total (counter, labels: status)
  - rl_annotations_total (counter)
  - rl_annotation_time_seconds (histogram)
  - rl_queue_depth (gauge) — read from Redis ZCARD
  - rl_export_jobs_total (counter, labels: status, format)
  - rl_agreement_score (gauge, labels: metric_type)
  - rl_annotator_throughput (gauge, labels: annotator_id)

GRAFANA DASHBOARDS:
  Dashboard 1 — Platform Overview:
    - Tasks by status (stacked bar)
    - Annotation throughput (time series)
    - Queue depth (line graph)
    - Score distribution (histogram)
    - Agreement trend (line)

  Dashboard 2 — Annotator Detail:
    - Per-annotator throughput
    - Gold task accuracy per annotator
    - Average time per task per annotator
    - Agreement with peers per annotator

SETUP:
  - monitoring/prometheus/prometheus.yml: scrape backend:8000/api/metrics/prometheus
  - monitoring/grafana/: datasource pointing to Prometheus
  - docker-compose.monitoring.yml: prometheus + grafana containers
  - Import dashboard JSON files on first startup
```

### 7.3 Advanced Features (Days 36-42)

```
TASK VERSIONING UI:
  - TaskDetailPage shows version history timeline
  - Researcher can view diff between versions
  - Annotations tagged with task version number

PREFERENCE COMPARISON MODE:
  - Task type "preference_comparison" shows two model outputs side by side
  - Annotator selects preferred output + strength (slight/moderate/strong)
  - Export generates paired preference data for DPO training

BULK OPERATIONS:
  - BulkUploadPage: drag-and-drop CSV/JSON upload
  - Preview parsed tasks before confirmation
  - Background processing via Celery for large files (1000+ tasks)

SKILL-BASED ROUTING:
  - Annotators have skills JSONB field: ["python", "math", "reasoning"]
  - Tasks have required_skills in metadata
  - assignment_service.get_next_assignment() filters queue by annotator skills

REAL-TIME UPDATES (optional):
  - WebSocket endpoint: /ws/dashboard
  - Push annotation events to researcher dashboard in real-time
  - Live queue depth counter
  - Uses FastAPI WebSocket support

ADVANCED EXPORT:
  - Streaming export for very large datasets
  - Direct S3 upload with presigned download URLs
  - Schedule recurring exports (daily/weekly)
```

---

## 8. Potential Pitfalls and How to Avoid Them

### 8.1 Backend Pitfalls

```
PITFALL 1: RACE CONDITIONS IN TASK ASSIGNMENT
  Problem: Two annotators request next task simultaneously, both get same task
  Solution: Use Redis ZPOPMIN which is atomic. Only one consumer gets the item.
  Additional: Wrap assignment creation in a DB transaction with a unique
  constraint on (task_id, annotator_id) to prevent duplicate assignments.

PITFALL 2: ORPHANED ASSIGNMENTS
  Problem: Annotator gets assigned task but never submits (closes browser, etc.)
  Solution: Celery beat task every 5 minutes checks for expired assignments.
  Set reasonable deadline (30 min default). Expired tasks go back to queue.
  CRITICAL: When returning task to queue, check if task still needs more
  annotations (completed_annotations < required_annotations).

PITFALL 3: DATABASE CONNECTION EXHAUSTION
  Problem: FastAPI async handlers + SQLAlchemy sessions not properly closed
  Solution: Always use dependency injection with get_db() that yields session
  in a try/finally block. Set connection pool limits:
    create_engine(pool_size=20, max_overflow=10, pool_timeout=30)
  Use async sessions with asyncpg for better performance.

PITFALL 4: CELERY TASK FAILURES LOSING EXPORT DATA
  Problem: Export task crashes halfway through, job stuck in "processing"
  Solution: Celery task retries with exponential backoff (max_retries=3).
  Always wrap in try/except, update job status to "failed" with error_message.
  Add health check: if job has been "processing" > 30 min, auto-mark failed.

PITFALL 5: JWT TOKEN MANAGEMENT
  Problem: Access tokens don't expire properly, refresh token reuse
  Solution: Short-lived access tokens (30 min). Refresh tokens stored server-side
  in Redis with jti (JWT ID). On refresh, invalidate old refresh token (rotate).
  On logout, add access token jti to Redis blacklist (TTL = remaining token life).

PITFALL 6: SLOW EXPORT QUERIES
  Problem: Exporting 100K+ annotations with joins is slow
  Solution: Use cursor-based pagination in export queries (not OFFSET).
  Write to file in streaming chunks, don't load all data into memory.
  Add database indexes on all columns used in export filters.
```

### 8.2 Frontend Pitfalls

```
PITFALL 7: ANNOTATOR LOSES WORK ON ACCIDENTAL NAVIGATION
  Problem: Annotator writes long response, accidentally navigates away
  Solution: Use beforeunload event listener when assignment is in progress.
  Auto-save draft to component state every 30 seconds.
  Show "unsaved changes" warning on navigation attempt.

PITFALL 8: STALE DATA IN DASHBOARD
  Problem: Researcher dashboard shows outdated metrics
  Solution: Use React Query (TanStack Query) with appropriate stale times.
  Dashboard: refetch every 30 seconds. Task list: refetch on focus.
  Show "last updated" timestamp on dashboard.

PITFALL 9: FORM VALIDATION MISMATCH
  Problem: Frontend validation passes but backend rejects
  Solution: Share validation rules via Zod schemas on frontend that mirror
  Pydantic schemas. Always handle API error responses gracefully — display
  backend validation errors in the form.
```

### 8.3 Infrastructure Pitfalls

```
PITFALL 10: REDIS DATA LOSS
  Problem: Redis restarts and task queue is lost
  Solution: Enable Redis AOF persistence (appendonly yes).
  Additionally: store queue state in Postgres as source of truth.
  On startup, reconcile Redis queue with Postgres tasks table
  (re-queue any task with status='queued' and completed_annotations < required).

PITFALL 11: DATABASE MIGRATIONS IN PRODUCTION
  Problem: Schema changes break running application
  Solution: Always use backward-compatible migrations.
  Add columns as nullable first, deploy code that handles null,
  then backfill data, then add NOT NULL constraint.
  Never drop columns in the same deploy as the code change.

PITFALL 12: DOCKER BUILD TIMES
  Problem: Every code change triggers full Docker rebuild
  Solution: Multi-stage Dockerfiles. Copy requirements/package.json first
  (cached layer), then copy source code. Use .dockerignore to exclude
  node_modules, __pycache__, .venv, .git.

PITFALL 13: ENVIRONMENT VARIABLE LEAKS
  Problem: Secrets committed to git or logged
  Solution: Never commit .env files. Use .env.example with placeholder values.
  In production, use secrets manager (AWS Secrets Manager / GCP Secret Manager).
  Mask sensitive values in application logs.
```

---

## 9. API Endpoint Reference (Complete)

### Auth

```
POST   /api/auth/register         Body: {email, password, display_name, role}  → {user_id, email, role}
POST   /api/auth/login             Body: {email, password}                     → {access_token, refresh_token, token_type}
POST   /api/auth/refresh           Body: {refresh_token}                       → {access_token, refresh_token}
GET    /api/auth/me                Header: Bearer token                        → {user_id, email, role, display_name}
```

### Projects (Researcher only)

```
GET    /api/projects               Query: page, page_size                      → {items: Project[], total, page}
POST   /api/projects               Body: {name, description, config}           → Project
GET    /api/projects/{id}                                                      → Project with stats
PUT    /api/projects/{id}          Body: {name?, description?, config?}        → Project
DELETE /api/projects/{id}                                                      → 204
```

### Tasks (Researcher only)

```
GET    /api/tasks                  Query: project_id, type, status, difficulty, page, page_size, sort_by  → {items: Task[], total}
POST   /api/tasks                  Body: TaskCreate                            → Task
GET    /api/tasks/{id}                                                         → Task with annotations, versions
PUT    /api/tasks/{id}             Body: TaskUpdate                            → Task (creates version if prompt changed)
DELETE /api/tasks/{id}                                                         → 204 (soft delete)
POST   /api/tasks/bulk             Body: multipart file (CSV/JSON)             → {created: int, errors: [{row, message}]}
GET    /api/tasks/{id}/versions                                                → TaskVersion[]
```

### Assignments (Annotator only, except history which is also researcher-viewable)

```
POST   /api/assignments/next                                                   → {assignment: Assignment, task: Task}
POST   /api/assignments/{id}/submit  Body: {content, content_type, reward_signal: RewardSignalCreate}  → {response, reward_signal}
POST   /api/assignments/{id}/skip                                              → 204
GET    /api/assignments/history    Query: page, page_size                      → {items: Assignment[], total}
```

### Exports (Researcher only)

```
POST   /api/exports                Body: {output_format, filters, quality_threshold}  → ExportJob
GET    /api/exports                Query: page, page_size                      → {items: ExportJob[], total}
GET    /api/exports/{id}                                                       → ExportJob (with status)
GET    /api/exports/{id}/download                                              → File download (if completed)
```

### Metrics (Researcher + Admin)

```
GET    /api/metrics/dashboard      → {total_tasks, tasks_by_status, total_annotations, avg_agreement, queue_depth, recent_activity}
GET    /api/metrics/annotators     Query: page, page_size  → {items: AnnotatorStats[], total}
GET    /api/metrics/annotators/{id} → {detailed annotator stats, gold accuracy, agreement}
GET    /api/metrics/tasks/{id}     → {agreement_scores, score_distribution, annotation_timeline}
GET    /api/metrics/prometheus     → Prometheus text format metrics
```

### Admin (Admin only)

```
GET    /api/admin/users            Query: role, is_active, page, page_size     → {items: User[], total}
PUT    /api/admin/users/{id}/role  Body: {role}                                → User
PUT    /api/admin/users/{id}/status Body: {is_active}                          → User
GET    /api/admin/health           → {db: ok/error, redis: ok/error, celery: ok/error, queue_depth: int}
```

---

## 10. Data Export Format Specifications

### 10.1 JSONL Format

```json
{"task_id": "uuid", "task_type": "coding", "prompt": "Write a function...", "response": "def foo():\n...", "overall_score": 5.0, "dimension_scores": {"correctness": 6, "helpfulness": 5}, "justification": "Good but...", "annotator_id": "uuid", "task_version": 1, "created_at": "2026-03-01T12:00:00Z"}
```

### 10.2 Preference Pairs Format

```json
{"prompt": "Explain quantum computing", "chosen": "Quantum computing uses...", "rejected": "It's about small computers...", "preference_strength": 3, "annotator_id": "uuid"}
```

### 10.3 HuggingFace TRL-Compatible Format

```json
{"prompt": "Explain quantum computing", "chosen": "Quantum computing uses qubits...", "rejected": "Computers that are quantum..."}
```

---

## 11. Environment Variables Reference

```
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
DATABASE_SYNC_URL=postgresql://user:pass@host:5432/dbname  # for Alembic

# Redis
REDIS_URL=redis://localhost:6379/0

# Auth
SECRET_KEY=<64-char-hex-string>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALGORITHM=HS256

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Storage
STORAGE_BACKEND=local  # or "s3"
LOCAL_STORAGE_PATH=./exports
S3_BUCKET=rl-training-exports
AWS_REGION=us-east-1

# Application
ENVIRONMENT=development  # or "production"
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Assignment defaults
DEFAULT_ASSIGNMENT_TIMEOUT_MINUTES=30
GOLD_TASK_FREQUENCY=10  # 1 gold task every N assignments

# Monitoring
PROMETHEUS_ENABLED=true
```

---

## 12. Implementation Notes for AI Agents

### Critical Implementation Rules

1. **Always use async**: All FastAPI endpoints and SQLAlchemy queries must use async/await. Use `asyncpg` driver, `AsyncSession` from SQLAlchemy.

2. **Transaction boundaries**: Any operation that creates multiple related rows (response + reward_signal, task + task_version) must be in a single database transaction using `async with session.begin():`.

3. **Redis operations must be atomic**: Use ZPOPMIN for queue dequeue, not separate ZRANGEBYSCORE + ZREM which has race conditions.

4. **Pydantic V2 syntax**: Use `model_validator`, `field_validator`, and `ConfigDict` — not the V1 `validator` or `Config` class.

5. **SQLAlchemy 2.0 style**: Use `select()` statements, not the legacy `session.query()` pattern. Use `Mapped[]` type annotations for model columns.

6. **File structure is non-negotiable**: Follow the exact file structure defined in Section 4. Every file has a single responsibility. Do not combine services or merge API routers.

7. **Error handling pattern**: All service functions raise custom exceptions (defined in `app/core/exceptions.py`). API routes catch these and return appropriate HTTP responses. Never let raw SQLAlchemy or Redis exceptions reach the client.

8. **Testing strategy**: Every API endpoint gets at least one happy-path test and one error test. Use `httpx.AsyncClient` with FastAPI's `TestClient`. Fixtures provide authenticated users of each role.

9. **CORS configuration**: In development, allow localhost:5173. In production, restrict to actual domain. Configure in `app/main.py` using `CORSMiddleware`.

10. **All IDs are UUIDs**: Use `uuid.uuid4()` for all primary keys. Store as UUID type in Postgres, serialize as strings in API responses.
