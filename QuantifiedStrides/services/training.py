"""
TrainingService

Handles training load history, HRV history, workout list, and workout detail.
"""

import asyncio
from datetime import date

from models.training import (
    HRVHistoryPointSchema,
    TrainingHistoryPointSchema,
    WeeklyVolumeSchema,
    WorkoutDetailSchema,
    WorkoutListItemSchema,
    WorkoutMetricPointSchema,
)
from repos.strength_repo import StrengthRepo
from repos.workout_repo import WorkoutRepo
from db.session import get_connection
from intelligence.training_load import get_history, get_hrv_history


class TrainingService:

    # ------------------------------------------------------------------
    # Training load history (wraps sync intelligence module — not yet migrated)
    # ------------------------------------------------------------------

    async def get_training_history(
        self, today: date, days: int = 90
    ) -> list[TrainingHistoryPointSchema]:
        def _sync():
            conn = get_connection()
            try:
                return get_history(conn.cursor(), today, days=days)
            finally:
                conn.close()

        rows = await asyncio.to_thread(_sync)
        return [
            TrainingHistoryPointSchema(
                date=r["date"],
                load=r["load"],
                ctl=r["ctl"],
                atl=r["atl"],
                tsb=r["tsb"],
            )
            for r in rows
        ]

    async def get_hrv_history(
        self, today: date, days: int = 30
    ) -> list[HRVHistoryPointSchema]:
        def _sync():
            conn = get_connection()
            try:
                return get_hrv_history(conn.cursor(), today, days=days)
            finally:
                conn.close()

        rows = await asyncio.to_thread(_sync)
        return [
            HRVHistoryPointSchema(
                date=r["date"],
                hrv=r["hrv"],
                baseline=r["baseline"],
                rhr=r.get("rhr"),
                sleep_score=r.get("sleep_score"),
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Weekly volume
    # ------------------------------------------------------------------

    async def get_weekly_volume(
        self, repo: StrengthRepo, user_id: int, weeks: int = 12
    ) -> list[WeeklyVolumeSchema]:
        rows = await repo.get_weekly_volume(user_id, weeks)
        return [
            WeeklyVolumeSchema(
                week_start=row.week_start,
                training_days=row.training_days,
                total_sets=row.total_sets,
            )
            for row in rows
        ]

    # ------------------------------------------------------------------
    # Workouts
    # ------------------------------------------------------------------

    async def list_workouts(
        self,
        repo: WorkoutRepo,
        user_id: int,
        days: int = 90,
        sport: str | None = None,
    ) -> list[WorkoutListItemSchema]:
        rows = await repo.list_workouts(user_id, days, sport)
        return [
            WorkoutListItemSchema(
                workout_id=row.workout_id,
                workout_date=row.workout_date,
                sport=row.sport,
                workout_type=row.workout_type,
                start_time=row.start_time,
                end_time=row.end_time,
                duration_s=row.duration_s,
                distance_m=row.distance_m,
                avg_hr=row.avg_heart_rate,
                max_hr=row.max_heart_rate,
                calories=row.calories_burned,
                tss=row.training_stress_score,
            )
            for row in rows
        ]

    async def get_sport_options(self, repo: WorkoutRepo, user_id: int) -> list[str]:
        return await repo.get_sport_options(user_id)

    async def get_workout_detail(
        self, repo: WorkoutRepo, user_id: int, workout_id: int
    ) -> WorkoutDetailSchema | None:
        row = await repo.get_by_id(user_id, workout_id)
        if not row:
            return None

        metrics = [
            WorkoutMetricPointSchema(
                metric_timestamp=m.metric_timestamp,
                heart_rate=m.heart_rate,
                pace=m.pace,
                cadence=m.cadence,
                vertical_oscillation=m.vertical_oscillation,
                vertical_ratio=m.vertical_ratio,
                ground_contact_time=m.ground_contact_time,
                power=m.power,
                latitude=m.latitude,
                longitude=m.longitude,
                altitude=m.altitude,
                distance=m.distance,
                gradient_pct=m.gradient_pct,
            )
            for m in await repo.get_metrics(workout_id)
        ]

        return WorkoutDetailSchema(
            workout_id=row.workout_id,
            workout_date=row.workout_date,
            sport=row.sport,
            workout_type=row.workout_type,
            start_time=row.start_time,
            end_time=row.end_time,
            duration_s=row.duration_s,
            distance_m=row.distance_m,
            avg_hr=row.avg_heart_rate,
            max_hr=row.max_heart_rate,
            calories=row.calories_burned,
            vo2max=row.vo2max_estimate,
            lactate_threshold=row.lactate_threshold_bpm,
            z1=row.time_in_hr_zone_1,
            z2=row.time_in_hr_zone_2,
            z3=row.time_in_hr_zone_3,
            z4=row.time_in_hr_zone_4,
            z5=row.time_in_hr_zone_5,
            elev_gain=row.elevation_gain,
            elev_loss=row.elevation_loss,
            aerobic_te=row.aerobic_training_effect,
            anaerobic_te=row.anaerobic_training_effect,
            tss=row.training_stress_score,
            norm_power=row.normalized_power,
            avg_power=row.avg_power,
            max_power=row.max_power,
            avg_cadence=row.avg_running_cadence,
            max_cadence=row.max_running_cadence,
            avg_gct=row.avg_ground_contact_time,
            avg_vo=row.avg_vertical_oscillation,
            avg_stride=row.avg_stride_length,
            avg_vr=row.avg_vertical_ratio,
            total_steps=row.total_steps,
            location=row.location,
            lat=row.start_latitude,
            lon=row.start_longitude,
            metrics=metrics,
        )