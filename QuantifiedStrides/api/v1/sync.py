import asyncio
from datetime import date, timedelta

import garminconnect
from fastapi import APIRouter, Depends, HTTPException

from core.settings import settings
from deps import get_current_user_id, get_user_repo, AsyncSessionLocal
from ingestion.environment import collect_environment_data
from ingestion.okgarmin_connection import get_garmin_client
from ingestion.sleep import collect_sleep_data
from ingestion.workout import collect_workout_data, _compute_post_sync_signals
from ingestion.workout_metrics import collect_workout_metrics
from repos.user_repo import UserRepo

router = APIRouter(prefix="/sync", tags=["sync"])

_GARMIN_AUTH_ERRORS = (
    garminconnect.GarminConnectAuthenticationError,
    garminconnect.GarminConnectTooManyRequestsError,
    garminconnect.GarminConnectConnectionError,
)


async def _compute_training_load_daily(user_id: int) -> None:
    """
    Compute ATL/CTL/TSB from stored TRIMP and upsert training_load_daily.
    Called after all ingestion steps complete. Failure raises so sync returns 500.
    """
    from intelligence.training_load import compute_load_metrics
    from repos.workout_repo import WorkoutRepo
    from repos.recommendation_repo import RecommendationRepo

    async with AsyncSessionLocal() as db:
        workout_repo = WorkoutRepo(db)
        rec_repo = RecommendationRepo(db)
        today = date.today()
        start = today - timedelta(days=90)
        trimp_series = await workout_repo.get_trimp_series(user_id, start, today)
        metrics = compute_load_metrics(trimp_series, today)
        await rec_repo.upsert_training_load_daily(
            user_id, today,
            metrics["atl"], metrics["ctl"], metrics["tsb"],
            metrics["acwr"], metrics["ramp_rate"],
        )
        await db.commit()


async def _update_hrv_baseline(user_id: int) -> None:
    """
    Recompute and store HRV baseline using clean-day readings.
    Non-fatal — errors are logged, sync still returns success.
    """
    from intelligence.recovery import establish_hrv_baseline
    from repos.sleep_repo import SleepRepo
    from repos.user_repo import UserRepo
    from datetime import date, timedelta

    try:
        async with AsyncSessionLocal() as db:
            sleep_repo = SleepRepo(db)
            user_repo = UserRepo(db)
            today = date.today()
            start = today - timedelta(days=365)
            rows = await sleep_repo.get_hrv_series_with_trimp(user_id, start, today)
            if rows:
                hrv_series = [float(r.overnight_hrv) for r in rows]
                preceding = [
                    float(r.preceding_trimp) if r.preceding_trimp is not None else None
                    for r in rows
                ]
                result = establish_hrv_baseline(hrv_series, preceding)
                if result is not None:
                    mean_val, sd_val = result
                    await user_repo.update_hrv_baseline(user_id, mean_val, sd_val)
                    await db.commit()
    except Exception as e:
        print(f"HRV baseline update error for user {user_id}: {e}")


@router.post("", status_code=200)
async def trigger_sync(
    user_id: int = Depends(get_current_user_id),
    repo: UserRepo = Depends(get_user_repo),
):
    if not settings.garmin_sync_enabled:
        print("Garmin sync skipped — GARMIN_SYNC_ENABLED=false")
        return {"ok": False, "results": [], "detail": "Garmin sync disabled (GARMIN_SYNC_ENABLED=false)"}

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

    # Post-sync signal computation — per-workout signals (non-fatal)
    async with AsyncSessionLocal() as db:
        await _compute_post_sync_signals(db, user_id)
        await db.commit()
    results.append({"step": "per_workout_signals", "ok": True})

    # training_load_daily upsert — last step; failure returns 500
    await _compute_training_load_daily(user_id)
    results.append({"step": "training_load_daily", "ok": True})

    # HRV baseline update — non-fatal background update
    asyncio.ensure_future(_update_hrv_baseline(user_id))

    # Zone speeds calibration — non-fatal background update
    asyncio.ensure_future(_calibrate_zone_speeds(user_id))

    return {"ok": all(r["ok"] for r in results), "results": results}


async def _calibrate_zone_speeds(user_id: int) -> None:
    """
    Recompute user_profile.zone_speeds from qualifying running sessions.
    Non-fatal — errors are logged, sync still returns success.
    Skips when fewer than 5 qualifying runs are available.
    """
    from intelligence.analytics.running_economy import compute_zone_speeds
    from repos.workout_repo import WorkoutRepo
    from repos.workout_metrics_repo import WorkoutMetricsRepo
    from repos.user_repo import UserRepo
    from datetime import date, timedelta

    try:
        async with AsyncSessionLocal() as db:
            workout_repo = WorkoutRepo(db)
            metrics_repo = WorkoutMetricsRepo(db)
            user_repo = UserRepo(db)
            today = date.today()
            since = today - timedelta(days=365)

            profile = await user_repo.get_profile_signals(user_id)
            if not profile or not profile.max_hr:
                return

            max_hr = float(profile.max_hr)
            qualifying = await workout_repo.get_running_workouts_for_signal_compute(user_id, since)

            # Filter to HR-stable qualifying runs
            stable_runs = [w for w in qualifying if (
                w.hr_stability_last_10min is not None
                and w.hr_stability_last_10min < 0.05
                and w.terrain_type is not None
            )]

            if len(stable_runs) < 5:
                return

            run_data = []
            for w in stable_runs:
                metrics = await metrics_repo.get_final_10min_hr_speed(w.workout_id)
                if metrics:
                    run_data.append({"terrain_type": w.terrain_type, "metrics": metrics})

            if not run_data:
                return

            zone_speeds = compute_zone_speeds(run_data, max_hr)
            if zone_speeds:
                await user_repo.update_zone_speeds(user_id, zone_speeds)
                await db.commit()
    except Exception as e:
        print(f"Zone speeds calibration error for user {user_id}: {e}")