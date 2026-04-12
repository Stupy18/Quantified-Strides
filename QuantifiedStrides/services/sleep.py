"""
SleepService

Sleep session list, detail with baseline comparisons, and trend data.
"""

from models.sleep import (
    SleepDetailSchema,
    SleepListItemSchema,
    SleepTrendPointSchema,
)
from repos.sleep_repo import SleepRepo


class SleepService:

    async def list_sleep(
        self, repo: SleepRepo, user_id: int, days: int = 90
    ) -> list[SleepListItemSchema]:
        rows = await repo.list_sleep(user_id, days)
        return [
            SleepListItemSchema(
                sleep_id=row.sleep_id,
                sleep_date=row.sleep_date,
                duration_minutes=row.duration_minutes,
                sleep_score=row.sleep_score,
                overnight_hrv=row.overnight_hrv,
                rhr=row.rhr,
                body_battery_change=row.body_battery_change,
                hrv_status=row.hrv_status,
            )
            for row in rows
        ]

    async def get_sleep_detail(
        self, repo: SleepRepo, user_id: int, sleep_id: int
    ) -> SleepDetailSchema | None:
        row = await repo.get_by_id(user_id, sleep_id)
        if not row:
            return None

        baselines = await repo.get_baselines(user_id, row.sleep_date)

        return SleepDetailSchema(
            sleep_id=row.sleep_id,
            sleep_date=row.sleep_date,
            duration_minutes=row.duration_minutes,
            sleep_score=row.sleep_score,
            overnight_hrv=row.overnight_hrv,
            hrv=row.hrv,
            rhr=row.rhr,
            time_in_deep=row.time_in_deep,
            time_in_light=row.time_in_light,
            time_in_rem=row.time_in_rem,
            time_awake=row.time_awake,
            avg_sleep_stress=row.avg_sleep_stress,
            sleep_score_feedback=row.sleep_score_feedback,
            sleep_score_insight=row.sleep_score_insight,
            hrv_status=row.hrv_status,
            body_battery_change=row.body_battery_change,
            baseline_hrv=baselines.get("hrv"),
            baseline_rhr=baselines.get("rhr"),
            baseline_score=baselines.get("score"),
            baseline_duration=baselines.get("duration"),
        )

    async def get_sleep_trends(
        self, repo: SleepRepo, user_id: int, days: int = 90
    ) -> list[SleepTrendPointSchema]:
        rows = await repo.get_trends(user_id, days)
        return [
            SleepTrendPointSchema(
                sleep_date=row.sleep_date,
                sleep_score=row.sleep_score,
                overnight_hrv=row.overnight_hrv,
                rhr=row.rhr,
                duration_minutes=row.duration_minutes,
                body_battery_change=row.body_battery_change,
            )
            for row in rows
        ]