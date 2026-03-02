from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, assignments, auth, exports, metrics, projects, tasks
from app.config import settings
from app.core.redis_client import close_redis, init_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler: initialise and tear down shared resources."""
    await init_redis()
    yield
    await close_redis()


app = FastAPI(
    title="RL Training Data Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(assignments.router)
app.include_router(exports.router)
app.include_router(metrics.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
