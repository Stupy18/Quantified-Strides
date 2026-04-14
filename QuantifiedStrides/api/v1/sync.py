import garminconnect
from fastapi import APIRouter, Depends, HTTPException

from deps import get_current_user_id, get_user_repo, AsyncSessionLocal
from ingestion.environment import collect_environment_data
from ingestion.okgarmin_connection import get_garmin_client
from ingestion.sleep import collect_sleep_data
from ingestion.workout import collect_workout_data
from ingestion.workout_metrics import collect_workout_metrics
from repos.user_repo import UserRepo

router = APIRouter(prefix="/sync", tags=["sync"])

_GARMIN_AUTH_ERRORS = (
    garminconnect.GarminConnectAuthenticationError,
    garminconnect.GarminConnectTooManyRequestsError,
    garminconnect.GarminConnectConnectionError,
)


@router.post("", status_code=200)
async def trigger_sync(
    user_id: int = Depends(get_current_user_id),
    repo: UserRepo = Depends(get_user_repo),
):
    try:
        client = get_garmin_client()
    except _GARMIN_AUTH_ERRORS as e:
        raise HTTPException(
            status_code=503,
            detail=f"Garmin authentication failed — try again later. ({e})",
        )

    results = []

    async with AsyncSessionLocal() as db:
        workout_ok = await collect_workout_data(db, user_id, client)
    results.append({"step": "workout", "ok": workout_ok})

    if workout_ok:
        async with AsyncSessionLocal() as db:
            await collect_workout_metrics(db, user_id, client)
        results.append({"step": "workout_metrics", "ok": True})

    async with AsyncSessionLocal() as db:
        await collect_sleep_data(db, user_id, client)
    results.append({"step": "sleep", "ok": True})

    async with AsyncSessionLocal() as db:
        await collect_environment_data(db)
    results.append({"step": "environment", "ok": True})

    return {"ok": all(r["ok"] for r in results), "results": results}