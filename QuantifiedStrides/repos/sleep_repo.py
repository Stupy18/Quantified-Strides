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

    async def get_resting_hr(self, user_id: int, today) -> float | None:
        """7-day median of sleep_sessions.min_hr (rhr) for TRIMP resting HR input."""
        result = await self.db.execute(
            text("""
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rhr) AS median_rhr
                FROM sleep_sessions
                WHERE user_id = :uid
                  AND sleep_date BETWEEN :start AND :today
                  AND rhr IS NOT NULL
            """),
            {"uid": user_id, "start": today - __import__('datetime').timedelta(days=7), "today": today},
        )
        row = result.fetchone()
        return float(row.median_rhr) if row and row.median_rhr else None

    async def get_hrv_series_with_trimp(self, user_id: int, start, until) -> list:
        """HRV series with preceding day TRIMP for HRV baseline quality filter."""
        result = await self.db.execute(
            text("""
                SELECT
                    s.sleep_date,
                    s.overnight_hrv,
                    LAG(w.day_trimp) OVER (ORDER BY s.sleep_date) AS preceding_trimp
                FROM sleep_sessions s
                LEFT JOIN (
                    SELECT workout_date, SUM(trimp) AS day_trimp
                    FROM workouts
                    WHERE user_id = :uid AND trimp IS NOT NULL
                    GROUP BY workout_date
                ) w ON w.workout_date = s.sleep_date - INTERVAL '1 day'
                WHERE s.user_id = :uid
                  AND s.sleep_date BETWEEN :start AND :until
                  AND s.overnight_hrv IS NOT NULL
                ORDER BY s.sleep_date
            """),
            {"uid": user_id, "start": start, "until": until},
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