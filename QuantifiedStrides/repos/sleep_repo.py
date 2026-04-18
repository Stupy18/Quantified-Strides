from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class SleepRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── list / lookup ──────────────────────────────────────────────────────────

    async def list_sleep(self, user_id: int, days: int = 90):
        result = await self.db.execute(
            text("""
                SELECT
                    sleep_id, sleep_date, duration_minutes, sleep_score,
                    overnight_hrv, rhr, body_battery_change, hrv_status
                FROM sleep_sessions
                WHERE user_id = :user_id
                  AND sleep_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                ORDER BY sleep_date DESC
            """),
            {"user_id": user_id, "days": days},
        )
        return result.fetchall()

    async def get_by_id(self, user_id: int, sleep_id: int):
        result = await self.db.execute(
            text("""
                SELECT
                    sleep_id, sleep_date, duration_minutes, sleep_score,
                    overnight_hrv, hrv, rhr,
                    time_in_deep, time_in_light, time_in_rem, time_awake,
                    avg_sleep_stress, sleep_score_feedback, sleep_score_insight,
                    hrv_status, body_battery_change
                FROM sleep_sessions
                WHERE sleep_id = :sleep_id AND user_id = :user_id
            """),
            {"sleep_id": sleep_id, "user_id": user_id},
        )
        return result.fetchone()

    async def get_for_date(self, user_id: int, d: date):
        """Single night's sleep — used by recommend engine."""
        result = await self.db.execute(
            text("""
                SELECT duration_minutes, sleep_score, hrv, rhr,
                       hrv_status, body_battery_change
                FROM sleep_sessions
                WHERE user_id = :uid AND sleep_date = :d
            """),
            {"uid": user_id, "d": d},
        )
        return result.fetchone()

    async def exists_for_date(self, user_id: int, d: date) -> bool:
        """Dedup check for ingestion."""
        result = await self.db.execute(
            text("SELECT 1 FROM sleep_sessions WHERE user_id = :uid AND sleep_date = :d LIMIT 1"),
            {"uid": user_id, "d": d},
        )
        return result.fetchone() is not None

    async def get_trends(self, user_id: int, days: int = 90):
        result = await self.db.execute(
            text("""
                SELECT sleep_date, sleep_score, overnight_hrv,
                       rhr, duration_minutes, body_battery_change
                FROM sleep_sessions
                WHERE user_id = :user_id
                  AND sleep_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                ORDER BY sleep_date
            """),
            {"user_id": user_id, "days": days},
        )
        return result.fetchall()

    # ── intelligence queries ───────────────────────────────────────────────────

    async def get_baselines(self, user_id: int, target_date: date) -> dict:
        """7-day rolling baseline for HRV, RHR, score, duration (sleep detail)."""
        result = await self.db.execute(
            text("""
                SELECT
                    AVG(overnight_hrv)    AS baseline_hrv,
                    AVG(rhr)              AS baseline_rhr,
                    AVG(sleep_score)      AS baseline_score,
                    AVG(duration_minutes) AS baseline_duration
                FROM sleep_sessions
                WHERE user_id = :user_id
                  AND sleep_date < :target_date
                  AND sleep_date >= :target_date - INTERVAL '7 days'
            """),
            {"user_id": user_id, "target_date": target_date},
        )
        row = result.fetchone()
        if not row:
            return {}
        return {
            "hrv":      float(row.baseline_hrv)      if row.baseline_hrv      else None,
            "rhr":      float(row.baseline_rhr)      if row.baseline_rhr      else None,
            "score":    float(row.baseline_score)    if row.baseline_score    else None,
            "duration": float(row.baseline_duration) if row.baseline_duration else None,
        }

    async def get_hrv_series(self, user_id: int, start: date, until: date):
        """HRV + RHR + sleep score series — used by training_load and recovery."""
        result = await self.db.execute(
            text("""
                SELECT sleep_date, overnight_hrv, rhr, sleep_score
                FROM sleep_sessions
                WHERE user_id = :uid
                  AND sleep_date BETWEEN :start AND :until
                  AND overnight_hrv IS NOT NULL
                ORDER BY sleep_date
            """),
            {"uid": user_id, "start": start, "until": until},
        )
        return result.fetchall()

    async def get_rhr_series(self, user_id: int, start: date, until: date):
        """RHR series for baseline deviation alerting (alerts.py)."""
        result = await self.db.execute(
            text("""
                SELECT sleep_date, rhr
                FROM sleep_sessions
                WHERE user_id = :uid
                  AND sleep_date BETWEEN :start AND :until
                  AND rhr IS NOT NULL
                ORDER BY sleep_date
            """),
            {"uid": user_id, "start": start, "until": until},
        )
        return result.fetchall()

    async def get_sleep_trend(self, user_id: int, start: date, until: date, limit: int = 3):
        """Recent sleep score + duration for sleep quality alerts (alerts.py)."""
        result = await self.db.execute(
            text("""
                SELECT sleep_date, sleep_score, duration_minutes
                FROM sleep_sessions
                WHERE user_id = :uid
                  AND sleep_date BETWEEN :start AND :until
                  AND sleep_score IS NOT NULL
                ORDER BY sleep_date DESC
                LIMIT :limit
            """),
            {"uid": user_id, "start": start, "until": until, "limit": limit},
        )
        return result.fetchall()

    # ── ingestion ──────────────────────────────────────────────────────────────

    async def insert(self, user_id: int, data: dict) -> None:
        await self.db.execute(
            text("""
                INSERT INTO sleep_sessions (
                    user_id, sleep_date, duration_minutes, sleep_score,
                    hrv, rhr, time_in_deep, time_in_light, time_in_rem, time_awake,
                    avg_sleep_stress, sleep_score_feedback, sleep_score_insight,
                    overnight_hrv, hrv_status, body_battery_change
                ) VALUES (
                    :user_id, :sleep_date, :duration_minutes, :sleep_score,
                    :hrv, :rhr, :time_in_deep, :time_in_light, :time_in_rem, :time_awake,
                    :avg_sleep_stress, :sleep_score_feedback, :sleep_score_insight,
                    :overnight_hrv, :hrv_status, :body_battery_change
                )
            """),
            {"user_id": user_id, **data},
        )
        await self.db.commit()