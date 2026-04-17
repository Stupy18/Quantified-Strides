"""
DashboardService

Aggregates all data needed for the home screen in one call.
Each concern is delegated to its own swappable service:

    TrainingLoadService   — ATL/CTL/TSB (rule-based today, learned model tomorrow)
    RecoveryService       — HRV status + muscle freshness
    AlertsService         — anomaly detection alerts
    RecommendationService — what to do today (rule-based → XGBoost → SASRec → Claude)

DashboardService itself contains NO intelligence logic — only orchestration.
"""

import asyncio
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from models.dashboard import (
    DashboardSchema,
    RecentLoadSchema,
    SleepSummarySchema,
    WeatherSchema,
    ReadinessSummarySchema,
)
from services.adapters.training_load import TrainingLoadService
from services.adapters.recovery import RecoveryService
from services.adapters.alerts import AlertsService
from services.adapters.recommendation import RecommendationService
from ai.narrative import generate_narrative

from repos.checkin_repo import CheckinRepo
from repos.environment_repo import EnvironmentRepo
from repos.knowledge_repo import KnowledgeRepo
from repos.narrative_repo import NarrativeRepo
from repos.sleep_repo import SleepRepo
from repos.strength_repo import StrengthRepo
from repos.user_repo import UserRepo
from repos.workout_repo import WorkoutRepo

from intelligence.recommend import get_last_nights_sleep, get_latest_weather, get_recent_load_by_sport


class DashboardService:

    def __init__(self, db: AsyncSession):
        workout_repo     = WorkoutRepo(db)
        strength_repo    = StrengthRepo(db)
        sleep_repo       = SleepRepo(db)
        checkin_repo     = CheckinRepo(db)
        environment_repo = EnvironmentRepo(db)
        user_repo        = UserRepo(db)

        self._sleep_repo       = sleep_repo
        self._environment_repo = environment_repo
        self._user_repo        = user_repo
        self._workout_repo     = workout_repo
        self._knowledge_repo   = KnowledgeRepo(db)
        self._narrative_repo   = NarrativeRepo(db)

        self._training_load  = TrainingLoadService(workout_repo, strength_repo)
        self._recovery       = RecoveryService(sleep_repo, strength_repo, workout_repo)
        self._alerts         = AlertsService(sleep_repo, workout_repo, checkin_repo)
        self._recommendation = RecommendationService(
            checkin_repo, strength_repo, workout_repo,
            sleep_repo, environment_repo, user_repo,
        )

    async def get_dashboard(self, user_id: int, today: date) -> DashboardSchema:
        # ── 1. Training load (needed by alerts + recommendation) ──────────────
        tl_raw, tl_schema = await self._training_load.get_metrics(today, user_id)

        # ── 2. Recovery (HRV + muscle freshness) — independent of load ────────
        (hrv_raw, hrv_schema), freshness_schema = await asyncio.gather(
            self._recovery.get_hrv_status(today, user_id),
            self._recovery.get_muscle_freshness(today, user_id),
        )

        # ── 3. Recommendation (also surfaces readiness for alerts) ─────────────
        readiness_raw, rec_schema = await self._recommendation.get_recommendation(
            today, tl_raw, user_id
        )

        # ── 4. Alerts (needs tl, hrv, and readiness from step 3) ──────────────
        alerts = await self._alerts.get_alerts(today, tl_raw, hrv_raw, readiness_raw, user_id=user_id)

        # ── 5. Contextual data (sleep summary, weather, recent load) ──────────
        sleep_schema, weather_schema, recent_load_schema = await asyncio.gather(
            self._get_sleep(today, user_id),
            self._get_weather(),
            self._get_recent_load(today, user_id),
        )

        # ── 6. Claude narrative (RAG-grounded, non-critical) ──────────────────
        narrative_context = {
            "tsb":               tl_raw.get("tsb"),
            "hrv_status":        hrv_raw.get("status") if hrv_raw else None,
            "sleep_score":       sleep_schema.score if sleep_schema else None,
            "readiness_overall": readiness_raw.get("overall") if readiness_raw else None,
        }
        rec_schema.narrative = await generate_narrative(
            rec_schema,
            narrative_context,
            user_repo=self._user_repo,
            narrative_repo=self._narrative_repo,
            knowledge_repo=self._knowledge_repo,
            user_id=user_id,
            today=today,
        )

        return DashboardSchema(
            date=today,
            alerts=alerts,
            training_load=tl_schema,
            hrv_status=hrv_schema,
            muscle_freshness=freshness_schema,
            recommendation=rec_schema,
            readiness=self._map_readiness(readiness_raw),
            sleep=sleep_schema,
            weather=weather_schema,
            recent_load=recent_load_schema,
        )

    # ------------------------------------------------------------------
    # Contextual data helpers
    # ------------------------------------------------------------------

    async def _get_sleep(self, today: date, user_id: int) -> SleepSummarySchema | None:
        raw = await get_last_nights_sleep(self._sleep_repo, today, user_id)
        return self._map_sleep(raw)

    async def _get_weather(self) -> WeatherSchema | None:
        raw = await get_latest_weather(self._environment_repo)
        return self._map_weather(raw)

    async def _get_recent_load(self, today: date, user_id: int) -> RecentLoadSchema:
        load = await get_recent_load_by_sport(self._user_repo, self._workout_repo, today, user_id=user_id)
        return RecentLoadSchema(by_sport=load)

    # ------------------------------------------------------------------
    # Schema mappers
    # ------------------------------------------------------------------

    def _map_readiness(self, r: dict | None) -> ReadinessSummarySchema | None:
        if not r:
            return None
        return ReadinessSummarySchema(
            overall=r.get("overall"),
            legs=r.get("legs"),
            upper=r.get("upper"),
            joints=r.get("joints"),
            injury_note=r.get("injury_note"),
            time=r.get("time"),
            going_out=r.get("going_out"),
        )

    def _map_sleep(self, s: dict | None) -> SleepSummarySchema | None:
        if not s:
            return None
        return SleepSummarySchema(
            duration=s.get("duration"),
            score=s.get("score"),
            hrv=s.get("hrv"),
            rhr=s.get("rhr"),
            hrv_status=s.get("hrv_status"),
            body_battery=s.get("body_battery"),
        )

    def _map_weather(self, w: dict | None) -> WeatherSchema | None:
        if not w:
            return None
        return WeatherSchema(
            temp=w.get("temp"),
            rain=w.get("rain"),
            wind=w.get("wind"),
        )