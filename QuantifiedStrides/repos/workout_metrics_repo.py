from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class WorkoutMetricsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── per-workout time-series ────────────────────────────────────────────────

    async def get_fatigue_series(self, workout_id: int):
        """Full biomechanics time-series for fatigue signature analysis."""
        result = await self.db.execute(
            text("""
                SELECT metric_timestamp, heart_rate, pace, cadence,
                       ground_contact_time, vertical_oscillation
                FROM workout_metrics
                WHERE workout_id = :wid
                  AND pace IS NOT NULL AND pace > 0 AND pace < 20
                ORDER BY metric_timestamp
            """),
            {"wid": workout_id},
        )
        return result.fetchall()

    async def get_pace_cadence_series(self, workout_id: int):
        """Pace + cadence series for cadence-speed profile."""
        result = await self.db.execute(
            text("""
                SELECT pace, cadence
                FROM workout_metrics
                WHERE workout_id = :wid
                  AND pace IS NOT NULL AND pace > 0 AND pace < 20
                  AND cadence IS NOT NULL AND cadence > 0
                ORDER BY metric_timestamp
            """),
            {"wid": workout_id},
        )
        return result.fetchall()

    async def get_biomechanics_summary(self, workout_id: int):
        """Single-row AVG/STDDEV summary for all biomechanics columns."""
        result = await self.db.execute(
            text("""
                SELECT
                    AVG(cadence)                 AS avg_cadence,
                    STDDEV(cadence)              AS std_cadence,
                    AVG(ground_contact_time)     AS avg_gct,
                    STDDEV(ground_contact_time)  AS std_gct,
                    AVG(vertical_oscillation)    AS avg_vo,
                    STDDEV(vertical_oscillation) AS std_vo,
                    AVG(vertical_ratio)          AS avg_vr,
                    STDDEV(vertical_ratio)       AS std_vr,
                    AVG(pace)                    AS avg_pace,
                    AVG(heart_rate)              AS avg_hr,
                    COUNT(*)                     AS n_rows
                FROM workout_metrics
                WHERE workout_id = :wid
                  AND pace IS NOT NULL AND pace > 0 AND pace < 20
            """),
            {"wid": workout_id},
        )
        return result.fetchone()

    async def get_pace_gradient_series(self, workout_id: int):
        """Pace + gradient series for Grade-Adjusted Pace computation."""
        result = await self.db.execute(
            text("""
                SELECT pace, gradient_pct
                FROM workout_metrics
                WHERE workout_id = :wid
                  AND pace IS NOT NULL AND pace > 0 AND pace < 20
                ORDER BY metric_timestamp
            """),
            {"wid": workout_id},
        )
        return result.fetchall()

    async def get_pace_hr_series(self, workout_id: int):
        """Pace + HR series for aerobic decoupling and HR-based REI."""
        result = await self.db.execute(
            text("""
                SELECT pace, heart_rate
                FROM workout_metrics
                WHERE workout_id = :wid
                  AND pace IS NOT NULL AND pace > 0 AND pace < 20
                  AND heart_rate IS NOT NULL AND heart_rate > 40
                ORDER BY metric_timestamp
            """),
            {"wid": workout_id},
        )
        return result.fetchall()

    async def get_pace_power_series(self, workout_id: int):
        """Pace + power series for power-based Running Economy Index."""
        result = await self.db.execute(
            text("""
                SELECT pace, power
                FROM workout_metrics
                WHERE workout_id = :wid
                  AND pace IS NOT NULL AND pace > 0 AND pace < 20
                  AND power IS NOT NULL AND power > 0
                ORDER BY metric_timestamp
            """),
            {"wid": workout_id},
        )
        return result.fetchall()

    async def get_elevation_series(self, workout_id: int):
        """Timestamped HR + pace + altitude + gradient for elevation decoupling."""
        result = await self.db.execute(
            text("""
                SELECT metric_timestamp, heart_rate, pace, altitude, gradient_pct
                FROM workout_metrics
                WHERE workout_id = :wid
                  AND altitude IS NOT NULL
                  AND heart_rate IS NOT NULL AND heart_rate > 40
                  AND pace IS NOT NULL AND pace > 0 AND pace < 20
                ORDER BY metric_timestamp
            """),
            {"wid": workout_id},
        )
        return result.fetchall()

    # ── cross-workout aggregates (joins workouts table) ────────────────────────

    async def get_hr_gradient_series(
        self,
        user_id: int,
        days: int,
        sport: str,
        gradient_range: int = 30,
    ):
        """
        HR + pace + gradient across all matching workouts.

        gradient_range: max absolute gradient to include (30 for HR curve,
                        20 for grade cost model and optimal gradient finder).
        """
        result = await self.db.execute(
            text("""
                SELECT wm.heart_rate, wm.pace, wm.gradient_pct
                FROM workout_metrics wm
                JOIN workouts w ON w.workout_id = wm.workout_id
                WHERE w.user_id = :uid
                  AND w.sport = :sport
                  AND w.workout_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                  AND wm.heart_rate IS NOT NULL AND wm.heart_rate > 40
                  AND wm.pace IS NOT NULL AND wm.pace > 0 AND wm.pace < 20
                  AND wm.gradient_pct IS NOT NULL
                  AND wm.gradient_pct BETWEEN :neg_gr AND :gr
            """),
            {"uid": user_id, "sport": sport, "days": days,
             "neg_gr": -gradient_range, "gr": gradient_range},
        )
        return result.fetchall()