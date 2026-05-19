"""
RecoveryService

Wraps recovery.py intelligence module.
HRV status uses the stored per-athlete baseline from user_profile.
Falls back to rolling-window method when baseline is not established.
"""

from datetime import date, timedelta

from models.dashboard import HRVStatusSchema, MuscleFreshnessSchema

from intelligence.recovery import compute_hrv_status, get_hrv_status, get_muscle_freshness
from repos.sleep_repo import SleepRepo
from repos.strength_repo import StrengthRepo
from repos.workout_repo import WorkoutRepo
from repos.user_repo import UserRepo


class RecoveryService:

    def __init__(
        self,
        sleep_repo: SleepRepo,
        strength_repo: StrengthRepo,
        workout_repo: WorkoutRepo,
        user_repo: UserRepo | None = None,
    ):
        self._sleep_repo    = sleep_repo
        self._strength_repo = strength_repo
        self._workout_repo  = workout_repo
        self._user_repo     = user_repo

    async def get_hrv_status(self, today: date, user_id: int = 1) -> tuple[dict, HRVStatusSchema]:
        raw: dict | None = None

        if self._user_repo is not None:
            try:
                hrv_mean, hrv_sd = await self._user_repo.get_hrv_baseline(user_id)
                if hrv_mean is not None and hrv_sd is not None:
                    start = today - timedelta(days=30)
                    rows = await self._sleep_repo.get_hrv_series(user_id, start, today)
                    if rows:
                        hrv_series = [float(r.overnight_hrv) for r in rows]
                        raw = compute_hrv_status(hrv_series, hrv_mean, hrv_sd)
                        # Add rolling trend field for backwards compatibility
                        raw.setdefault("trend", None)
                        raw.setdefault("baseline", hrv_mean)
                        raw.setdefault("baseline_sd", hrv_sd)
                        raw.setdefault("deviation", raw.get("z"))
            except Exception:
                raw = None

        if raw is None:
            raw = await get_hrv_status(self._sleep_repo, today, user_id=user_id)

        schema = HRVStatusSchema(
            status=raw["status"],
            trend=raw.get("trend"),
            last_hrv=raw.get("last_hrv"),
            baseline=raw.get("baseline"),
            baseline_sd=raw.get("baseline_sd"),
            deviation=raw.get("deviation"),
        )
        return raw, schema

    async def get_muscle_freshness(self, today: date, user_id: int = 1) -> MuscleFreshnessSchema:
        muscles = await get_muscle_freshness(
            self._strength_repo, self._workout_repo, today, user_id=user_id
        )
        return MuscleFreshnessSchema(muscles=muscles)