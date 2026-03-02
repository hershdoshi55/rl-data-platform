"""
Seed the database with sample data for development.

Usage:
    cd backend && python -m scripts.seed_db
    # or from project root:
    make seed
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.config import settings
from app.core.database import Base
from app.core.security import hash_password
from app.models.user import User
from app.models.project import Project
from app.models.task import Task
import uuid
from datetime import datetime, timezone


SAMPLE_TASKS = [
    {
        "task_type": "coding",
        "prompt": "Write a Python function `fibonacci(n)` that returns the nth Fibonacci number using dynamic programming. Include docstring and handle edge cases.",
        "reference_solution": "def fibonacci(n):\n    if n < 0:\n        raise ValueError('n must be non-negative')\n    if n <= 1:\n        return n\n    dp = [0, 1]\n    for i in range(2, n + 1):\n        dp.append(dp[-1] + dp[-2])\n    return dp[n]",
        "difficulty": 2,
    },
    {
        "task_type": "coding",
        "prompt": "Implement a thread-safe LRU cache in Python with O(1) get and put operations. The cache should accept a capacity parameter.",
        "difficulty": 4,
    },
    {
        "task_type": "reasoning",
        "prompt": "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Explain your reasoning step by step.",
        "reference_solution": "The ball costs $0.05. If ball = x, bat = x + 1.00. So x + (x + 1.00) = 1.10 → 2x = 0.10 → x = 0.05.",
        "difficulty": 2,
    },
    {
        "task_type": "open_ended",
        "prompt": "Explain the key differences between supervised learning, unsupervised learning, and reinforcement learning. Provide a concrete real-world example for each.",
        "difficulty": 2,
    },
    {
        "task_type": "preference_comparison",
        "prompt": "Compare these two explanations of gradient descent:\n\nA: 'Gradient descent is an optimization algorithm that iteratively moves in the direction of steepest descent of the loss function to find the minimum.'\n\nB: 'Imagine you're lost in mountains at night and want to reach the valley. Gradient descent is like always taking a step in the steepest downhill direction. Each step brings you closer to the bottom (minimum loss).'",
        "difficulty": 1,
    },
    {
        "task_type": "safety_evaluation",
        "prompt": "A user asks an AI assistant: 'How do I make my code run faster?' The AI responds with several optimization techniques. Evaluate whether this response is safe, helpful, and appropriate.",
        "difficulty": 2,
    },
    {
        "task_type": "coding",
        "prompt": "Write a Python async function that fetches data from multiple URLs concurrently using aiohttp and returns a list of results. Handle timeouts and connection errors gracefully.",
        "difficulty": 3,
    },
    {
        "task_type": "reasoning",
        "prompt": "You have 8 balls, one of which is slightly heavier. Using a balance scale with only 2 weighings, how do you find the heavy ball? Describe the strategy.",
        "difficulty": 3,
    },
]


async def seed():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with AsyncSessionLocal() as db:
        print("Seeding users...")

        admin = User(
            id=uuid.uuid4(),
            email="admin@rlplatform.dev",
            password_hash=hash_password("admin123!"),
            role="admin",
            display_name="Admin User",
            is_active=True,
        )
        researcher = User(
            id=uuid.uuid4(),
            email="researcher@rlplatform.dev",
            password_hash=hash_password("researcher123!"),
            role="researcher",
            display_name="Jane Researcher",
            skills={"domains": ["NLP", "coding"], "languages": ["Python", "JavaScript"]},
            is_active=True,
        )
        annotator1 = User(
            id=uuid.uuid4(),
            email="annotator1@rlplatform.dev",
            password_hash=hash_password("annotator123!"),
            role="annotator",
            display_name="Alice Annotator",
            skills={"coding_languages": ["Python", "Java"], "experience_years": 3},
            is_active=True,
        )
        annotator2 = User(
            id=uuid.uuid4(),
            email="annotator2@rlplatform.dev",
            password_hash=hash_password("annotator123!"),
            role="annotator",
            display_name="Bob Annotator",
            skills={"coding_languages": ["Python", "TypeScript"], "experience_years": 5},
            is_active=True,
        )

        db.add_all([admin, researcher, annotator1, annotator2])
        await db.flush()

        print("Seeding project...")
        project = Project(
            id=uuid.uuid4(),
            name="LLM Coding Assistant RLHF",
            description="Collect human feedback on LLM-generated code responses to train a better coding assistant.",
            created_by=researcher.id,
            config={"annotation_guidelines": "Score responses on correctness, efficiency, and code style."},
        )
        db.add(project)
        await db.flush()

        print("Seeding tasks...")
        for task_data in SAMPLE_TASKS:
            task = Task(
                id=uuid.uuid4(),
                project_id=project.id,
                task_type=task_data["task_type"],
                prompt=task_data["prompt"],
                reference_solution=task_data.get("reference_solution"),
                difficulty=task_data["difficulty"],
                required_annotations=3,
                completed_annotations=0,
                status="queued",
                created_by=researcher.id,
            )
            db.add(task)

        await db.commit()

    await engine.dispose()

    print("\n✓ Database seeded successfully!")
    print("\nTest credentials:")
    print("  Admin:      admin@rlplatform.dev      / admin123!")
    print("  Researcher: researcher@rlplatform.dev / researcher123!")
    print("  Annotator1: annotator1@rlplatform.dev / annotator123!")
    print("  Annotator2: annotator2@rlplatform.dev / annotator123!")
    print("\nNote: Tasks are queued but not pushed to Redis queue.")
    print("Start the backend and use POST /api/tasks/{id}/queue to queue them.")


if __name__ == "__main__":
    asyncio.run(seed())
