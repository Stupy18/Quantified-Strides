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

from fastapi import APIRouter, Depends

from deps import get_current_user_id, get_user_repo
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
    creds = await repo.get_garmin_creds(user_id)
    results = []

    workout = await _run("workout.py", creds)
    results.append(workout)

    if workout["ok"]:
        results.append(await _run("workout_metrics.py", creds))

    results.append(await _run("sleep.py", creds))
    results.append(await _run("environment.py", creds))

    return {"ok": all(r["ok"] for r in results), "results": results}