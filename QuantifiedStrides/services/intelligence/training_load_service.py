"""
TrainingLoadService

Wraps training_load.py intelligence module.
ATL/CTL/TSB are read from the precomputed training_load_daily table.
Falls back to on-demand computation when no precomputed row exists.
"""

from datetime import date

from models.dashboard import TrainingLoadSchema

from intelligence.training_load import get_metrics, tsb_intensity_hint
from repos.workout_repo import WorkoutRepo
from repos.strength_repo import StrengthRepo
from repos.recommendation_repo import RecommendationRepo


class TrainingLoadService:

    def __init__(
        self,
        workout_repo: WorkoutRepo,
        strength_repo: StrengthRepo,
        recommendation_repo: RecommendationRepo | None = None,
    ):
        self._workout_repo      = workout_repo
        self._strength_repo     = strength_repo
        self._recommendation_repo = recommendation_repo

    async def get_metrics(self, today: date, user_id: int = 1) -> tuple[dict, TrainingLoadSchema]:
        """
        Returns the raw metrics dict (passed to AlertsService) and the
        mapped TrainingLoadSchema (used by DashboardService directly).

        Reads from training_load_daily when available (O(1) lookup).
        Falls back to on-demand computation for backwards compatibility.
        """
        raw: dict | None = None

        if self._recommendation_repo is not None:
            try:
                row = await self._recommendation_repo.get_training_load_daily(user_id, today)
                if row:
                    raw = {
                        "ctl":        row.ctl,
                        "atl":        row.atl,
                        "tsb":        row.tsb,
                        "today_load": 0.0,  # not stored in daily table; use 0 as placeholder
                        "ramp_rate":  row.ramp_rate or 0.0,
                        "acwr":       row.acwr,
                    }
            except Exception:
                raw = None

        if raw is None:
            raw = await get_metrics(self._workout_repo, self._strength_repo, today, user_id=user_id)

        freshness_label, intensity_modifier = tsb_intensity_hint(raw["tsb"])
        schema = TrainingLoadSchema(
            ctl=raw["ctl"],
            atl=raw["atl"],
            tsb=raw["tsb"],
            today_load=raw.get("today_load", 0.0),
            ramp_rate=raw.get("ramp_rate", 0.0),
            freshness_label=freshness_label,
            intensity_modifier=intensity_modifier,
        )
        return raw, schema