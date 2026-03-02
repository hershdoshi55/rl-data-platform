from contextlib import asynccontextmanager
from typing import Optional

import redis.asyncio as aioredis

from app.config import settings

# Module-level singleton — initialized on startup via init_redis()
redis_client: Optional[aioredis.Redis] = None

TASK_QUEUE_KEY = "task_queue"


async def init_redis() -> None:
    """Initialize the Redis connection pool singleton."""
    global redis_client
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global redis_client
    if redis_client is not None:
        await redis_client.aclose()
        redis_client = None


@asynccontextmanager
async def get_redis():
    """Async context manager that yields the Redis singleton.

    Usage::

        async with get_redis() as r:
            await r.set("key", "value")
    """
    if redis_client is None:
        # Lazily initialise if startup hook was not called (e.g. during tests)
        temp = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        try:
            yield temp
        finally:
            await temp.aclose()
    else:
        yield redis_client


async def push_to_queue(task_id: str, priority_score: float) -> None:
    """Add a task to the priority queue (sorted set).

    Lower scores are dequeued first (ZPOPMIN).
    We negate the score so that higher-priority tasks pop first.
    """
    async with get_redis() as r:
        await r.zadd(TASK_QUEUE_KEY, {task_id: priority_score})


async def pop_from_queue() -> Optional[str]:
    """Atomically dequeue the highest-priority task.

    Uses ZPOPMIN which atomically returns and removes the element with the
    lowest score.  Returns the task_id string or None if the queue is empty.

    With decode_responses=True, redis-py returns ZPOPMIN results as a list
    of (member, score) tuples: [(task_id_str, score_float), ...].
    """
    async with get_redis() as r:
        result = await r.zpopmin(TASK_QUEUE_KEY, count=1)
        if not result:
            return None
        # result[0] is a (member, score) tuple
        entry = result[0]
        if isinstance(entry, (list, tuple)):
            return str(entry[0])
        # Fallback: bare string (older redis-py versions)
        return str(entry)


async def blacklist_token(token: str, ttl: int) -> None:
    """Store a JWT in the Redis blacklist with the given TTL (seconds)."""
    async with get_redis() as r:
        await r.setex(f"blacklist:{token}", ttl, "1")


async def is_token_blacklisted(token: str) -> bool:
    """Return True if the token has been blacklisted."""
    async with get_redis() as r:
        value = await r.get(f"blacklist:{token}")
        return value is not None
