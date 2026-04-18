"""
TrainingLoadService

Wraps training_load.py intelligence module.
Today: rule-based TRIMP/ATL/CTL/TSB.
Tomorrow: swap _compute for a learned load model without touching DashboardService.
"""

from datetime import date

from models.dashboard import TrainingLoadSchema

from intelligence.training_load import get_metrics, tsb_intensity_hint
from repos.workout_repo import WorkoutRepo
from repos.strength_repo import StrengthRepo


class TrainingLoadService:

    def __init__(self, workout_repo: WorkoutRepo, strength_repo: StrengthRepo):
        self._workout_repo  = workout_repo
        self._strength_repo = strength_repo

    async def get_metrics(self, today: date, user_id: int = 1) -> tuple[dict, TrainingLoadSchema]:
        """
        Returns the raw metrics dict (passed to AlertsService) and the
        mapped TrainingLoadSchema (used by DashboardService directly).
        """
        raw = await get_metrics(self._workout_repo, self._strength_repo, today, user_id=user_id)
        freshness_label, intensity_modifier = tsb_intensity_hint(raw["tsb"])
        schema = TrainingLoadSchema(
            ctl=raw["ctl"],
            atl=raw["atl"],
            tsb=raw["tsb"],
            today_load=raw["today_load"],
            ramp_rate=raw["ramp_rate"],
            freshness_label=freshness_label,
            intensity_modifier=intensity_modifier,
        )
        return raw, schema