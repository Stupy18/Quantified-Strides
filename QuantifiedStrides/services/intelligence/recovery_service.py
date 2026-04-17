"""
RecoveryService

Wraps recovery.py intelligence module.
Today: rule-based HRV deviation + exponential muscle fatigue decay.
Tomorrow: swap _compute_hrv / _compute_freshness for learned models
          without touching DashboardService.
"""

from datetime import date

from models.dashboard import HRVStatusSchema, MuscleFreshnessSchema

from intelligence.recovery import get_hrv_status, get_muscle_freshness
from repos.sleep_repo import SleepRepo
from repos.strength_repo import StrengthRepo
from repos.workout_repo import WorkoutRepo


class RecoveryService:

    def __init__(
        self,
        sleep_repo: SleepRepo,
        strength_repo: StrengthRepo,
        workout_repo: WorkoutRepo,
    ):
        self._sleep_repo    = sleep_repo
        self._strength_repo = strength_repo
        self._workout_repo  = workout_repo

    async def get_hrv_status(self, today: date, user_id: int = 1) -> tuple[dict, HRVStatusSchema]:
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