"""
RecommendationService

THE key swappable service in the architecture.

Today:  rule-based engine from recommend.py (gated logic on readiness,
        sleep, weather, load, consecutive days, gym analysis).
Phase 2: replace build_recommendation with an XGBoost model trained on accumulated data.
Phase 3: replace with SASRec transformer for multi-athlete sequential recommendations.
Phase 4: add Claude API narrative layer on top of whatever model runs below.

DashboardService calls this service — it never touches recommend.py directly.
"""

from datetime import date, timedelta

from models.dashboard import ExerciseSuggestionSchema, GymRecSchema, RecommendationSchema

from intelligence.recommend import (
    get_readiness,
    get_yesterdays_training,
    get_last_nights_sleep,
    get_recent_load,
    get_latest_weather,
    get_gym_analysis,
    get_consecutive_training_days,
    get_exercise_suggestions,
    build_recommendation,
)
from repos.checkin_repo import CheckinRepo
from repos.strength_repo import StrengthRepo
from repos.workout_repo import WorkoutRepo
from repos.sleep_repo import SleepRepo
from repos.environment_repo import EnvironmentRepo
from repos.user_repo import UserRepo


class RecommendationService:

    def __init__(
        self,
        checkin_repo: CheckinRepo,
        strength_repo: StrengthRepo,
        workout_repo: WorkoutRepo,
        sleep_repo: SleepRepo,
        environment_repo: EnvironmentRepo,
        user_repo: UserRepo,
    ):
        self._checkin_repo     = checkin_repo
        self._strength_repo    = strength_repo
        self._workout_repo     = workout_repo
        self._sleep_repo       = sleep_repo
        self._environment_repo = environment_repo
        self._user_repo        = user_repo

    async def get_recommendation(
        self,
        today: date,
        tl_metrics: dict,
        user_id: int = 1,
    ) -> tuple[dict | None, RecommendationSchema]:
        """
        Returns (raw_readiness_dict, RecommendationSchema).

        raw_readiness_dict is passed to AlertsService so it can incorporate
        subjective signals into alerts.
        """
        yesterday = today - timedelta(days=1)

        readiness    = await get_readiness(self._checkin_repo, today, user_id)
        yday         = await get_yesterdays_training(
            self._checkin_repo, self._strength_repo, self._workout_repo, yesterday, user_id
        )
        sleep        = await get_last_nights_sleep(self._sleep_repo, today, user_id)
        weather      = await get_latest_weather(self._environment_repo)
        load         = await get_recent_load(self._workout_repo, today, user_id=user_id)
        consec       = await get_consecutive_training_days(self._workout_repo, today, user_id)
        gym_analysis = await get_gym_analysis(self._strength_repo, today, user_id)

        rec_raw = build_recommendation(
            readiness, yday, sleep, weather, load,
            consec, gym_analysis, today, tl_metrics, user_id,
        )

        exercises_raw = await get_exercise_suggestions(
            self._strength_repo, self._workout_repo, rec_raw.get("gym_rec"), today, user_id
        )

        schema = RecommendationSchema(
            date=today,
            primary=rec_raw.get("primary", ""),
            intensity=rec_raw.get("intensity"),
            duration=rec_raw.get("duration"),
            why=rec_raw.get("why"),
            avoid=rec_raw.get("avoid", []),
            notes=rec_raw.get("notes", []),
            blocks=rec_raw.get("blocks", {}),
            gym_rec=self._map_gym_rec(rec_raw.get("gym_rec")),
            exercises=[
                ExerciseSuggestionSchema(
                    name=ex["name"],
                    sets=ex.get("sets"),
                    reps=ex.get("reps"),
                    duration=ex.get("duration"),
                    weight_str=ex.get("weight_str"),
                    note=ex.get("note"),
                    pattern=ex.get("pattern"),
                    quality=ex.get("quality"),
                    last_done=ex.get("last_done"),
                )
                for ex in (exercises_raw or [])
            ],
            narrative=None,  # Phase 4: Claude API fills this in
        )
        return readiness, schema

    def _map_gym_rec(self, gym_rec: dict | None) -> GymRecSchema | None:
        if not gym_rec:
            return None
        return GymRecSchema(
            intensity=gym_rec.get("intensity"),
            focus=gym_rec.get("focus"),
            focus_label=gym_rec.get("focus_label"),
            why=gym_rec.get("why"),
            session_type=gym_rec.get("session_type"),
        )