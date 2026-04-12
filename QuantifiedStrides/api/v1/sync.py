"""
POST /api/v1/sync  — trigger Garmin + environment data collection.

Runs workout.py → workout_metrics.py → sleep.py → environment.py
sequentially as subprocesses and injects the user's Garmin credentials
as environment variables so multi-user sync works correctly.
"""

import asyncio
import os
import sys
from pathlib import Path
from core.config import GARMIN_EMAIL, GARMIN_PASSWORD

import garminconnect
from fastapi import APIRouter, Depends

from deps import get_current_user_id, get_user_repo, AsyncSessionLocal
from ingestion.environment import collect_environment_data
from ingestion.sleep import collect_sleep_data
from ingestion.workout import collect_workout_data
from repos.user_repo import UserRepo

router = APIRouter(prefix="/sync", tags=["sync"])

_PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


async def _run(script: str, extra_env: dict) -> dict:
    env = {**os.environ, **extra_env}

    def _sync():
        import subprocess
        return subprocess.run(
            [sys.executable, str(_PROJECT_ROOT / script)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(_PROJECT_ROOT),
            env=env,
        )

    proc = await asyncio.to_thread(_sync)
    return {
        "script": script,
        "ok":     proc.returncode == 0,
        "stdout": proc.stdout.decode(errors="replace").strip(),
        "stderr": proc.stderr.decode(errors="replace").strip(),
    }




@router.post("", status_code=200)
async def trigger_sync(

    user_id: int = Depends(get_current_user_id),
    repo: UserRepo = Depends(get_user_repo),
):



    results = []

    async with AsyncSessionLocal() as db:
        await collect_workout_data(db, user_id)
    results.append({"ok": True})

    async with AsyncSessionLocal() as db:
        await collect_sleep_data(db, user_id)
    results.append({"ok": True})

    async with AsyncSessionLocal() as db:
        await collect_environment_data(db)  # no Garmin needed
    results.append({"ok": True})

    return {"ok": all(r["ok"] for r in results), "results": results}