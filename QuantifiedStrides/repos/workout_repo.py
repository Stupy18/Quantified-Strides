from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class WorkoutRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── list / lookup ──────────────────────────────────────────────────────────

    async def list_workouts(
        self,
        user_id: int,
        days: int = 90,
        sport: str | None = None,
    ):
        query = """
            SELECT
                workout_id, workout_date, sport, workout_type,
                start_time, end_time,
                EXTRACT(EPOCH FROM (end_time - start_time)) AS duration_s,
                training_volume                              AS distance_m,
                avg_heart_rate, max_heart_rate,
                calories_burned,
                training_stress_score
            FROM workouts
            WHERE user_id = :user_id
              AND workout_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
        """
        params: dict = {"user_id": user_id, "days": days}

        if sport:
            query += " AND sport = :sport"
            params["sport"] = sport

        query += " ORDER BY workout_date DESC, start_time DESC"

        result = await self.db.execute(text(query), params)
        return result.fetchall()

    async def get_by_id(self, user_id: int, workout_id: int):
        result = await self.db.execute(
            text("""
                SELECT
                    workout_id, workout_date, sport, workout_type,
                    start_time, end_time,
                    EXTRACT(EPOCH FROM (end_time - start_time)) AS duration_s,
                    training_volume          AS distance_m,
                    avg_heart_rate, max_heart_rate, calories_burned,
                    vo2max_estimate, lactate_threshold_bpm,
                    time_in_hr_zone_1, time_in_hr_zone_2, time_in_hr_zone_3,
                    time_in_hr_zone_4, time_in_hr_zone_5,
                    elevation_gain, elevation_loss,
                    aerobic_training_effect, anaerobic_training_effect,
                    training_stress_score, normalized_power,
                    avg_power, max_power,
                    avg_running_cadence, max_running_cadence,
                    avg_ground_contact_time, avg_vertical_oscillation,
                    avg_stride_length, avg_vertical_ratio,
                    total_steps,
                    location, start_latitude, start_longitude
                FROM workouts
                WHERE workout_id = :workout_id AND user_id = :user_id
            """),
            {"workout_id": workout_id, "user_id": user_id},
        )
        return result.fetchone()

    async def get_by_start_time(self, user_id: int, start_time: datetime):
        result = await self.db.execute(
            text("SELECT workout_id FROM workouts WHERE user_id = :uid AND start_time = :st"),
            {"uid": user_id, "st": start_time},
        )
        return result.fetchone()

    async def get_by_date(self, user_id: int, workout_date: date):
        result = await self.db.execute(
            text("SELECT workout_id FROM workouts WHERE user_id = :uid AND workout_date = :d"),
            {"uid": user_id, "d": workout_date},
        )
        return result.fetchone()

    async def get_sport_options(self, user_id: int) -> list[str]:
        result = await self.db.execute(
            text("""
                SELECT DISTINCT sport FROM workouts
                WHERE user_id = :user_id AND sport IS NOT NULL
                ORDER BY sport
            """),
            {"user_id": user_id},
        )
        return [row.sport for row in result.fetchall()]

    # ── intelligence queries ───────────────────────────────────────────────────

    async def get_hr_zones_for_date(self, user_id: int, d: date):
        """Returns all workouts' HR zone seconds for a given date (for TRIMP)."""
        result = await self.db.execute(
            text("""
                SELECT time_in_hr_zone_1, time_in_hr_zone_2, time_in_hr_zone_3,
                       time_in_hr_zone_4, time_in_hr_zone_5
                FROM workouts
                WHERE user_id = :uid AND workout_date = :d
            """),
            {"uid": user_id, "d": d},
        )
        return result.fetchall()

    async def get_garmin_workout_for_date(self, user_id: int, d: date):
        """Most recent non-strength Garmin workout on a given date (for recommend)."""
        result = await self.db.execute(
            text("""
                SELECT sport, workout_type, training_volume, avg_heart_rate
                FROM workouts
                WHERE user_id = :uid AND workout_date = :d
                  AND sport != 'strength_training'
                ORDER BY start_time DESC
                LIMIT 1
            """),
            {"uid": user_id, "d": d},
        )
        return result.fetchone()

    async def get_recent_sport_load(self, user_id: int, since: date, until: date):
        """Per-sport volume + minutes between two dates (for recommend engine)."""
        result = await self.db.execute(
            text("""
                SELECT sport,
                       COUNT(*),
                       SUM(training_volume),
                       SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
                FROM workouts
                WHERE user_id = :uid
                  AND workout_date > :since AND workout_date <= :until
                  AND sport != 'strength_training'
                GROUP BY sport
            """),
            {"uid": user_id, "since": since, "until": until},
        )
        return result.fetchall()

    async def had_workout_on_date(self, user_id: int, d: date) -> bool:
        """Used by consecutive-days counter alongside strength_sessions."""
        result = await self.db.execute(
            text("SELECT 1 FROM workouts WHERE user_id = :uid AND workout_date = :d LIMIT 1"),
            {"uid": user_id, "d": d},
        )
        return result.fetchone() is not None

    # ── workout_metrics ────────────────────────────────────────────────────────

    async def get_metrics(self, workout_id: int):
        result = await self.db.execute(
            text("""
                SELECT
                    metric_timestamp, heart_rate, pace, cadence,
                    vertical_oscillation, vertical_ratio, ground_contact_time,
                    power, latitude, longitude, altitude, distance, gradient_pct
                FROM workout_metrics
                WHERE workout_id = :workout_id
                ORDER BY metric_timestamp
            """),
            {"workout_id": workout_id},
        )
        return result.fetchall()

    async def metrics_exist(self, workout_id: int) -> bool:
        result = await self.db.execute(
            text("SELECT 1 FROM workout_metrics WHERE workout_id = :wid LIMIT 1"),
            {"wid": workout_id},
        )
        return result.fetchone() is not None

    async def insert_metrics_batch(self, rows: list[tuple]) -> int:
        """
        Bulk-insert workout_metrics rows.
        Each tuple: (workout_id, metric_timestamp, heart_rate, pace, cadence,
                     vertical_oscillation, vertical_ratio, ground_contact_time,
                     power, latitude, longitude, altitude, distance, gradient_pct)
        Returns count of rows inserted.
        """
        if not rows:
            return 0
        await self.db.execute(
            text("""
                INSERT INTO workout_metrics (
                    workout_id, metric_timestamp, heart_rate, pace, cadence,
                    vertical_oscillation, vertical_ratio, ground_contact_time,
                    power, latitude, longitude, altitude, distance, gradient_pct
                ) VALUES (
                    :workout_id, :metric_timestamp, :heart_rate, :pace, :cadence,
                    :vertical_oscillation, :vertical_ratio, :ground_contact_time,
                    :power, :latitude, :longitude, :altitude, :distance, :gradient_pct
                )
            """),
            [
                {
                    "workout_id": r[0], "metric_timestamp": r[1], "heart_rate": r[2],
                    "pace": r[3], "cadence": r[4], "vertical_oscillation": r[5],
                    "vertical_ratio": r[6], "ground_contact_time": r[7], "power": r[8],
                    "latitude": r[9], "longitude": r[10], "altitude": r[11],
                    "distance": r[12], "gradient_pct": r[13],
                }
                for r in rows
            ],
        )
        return len(rows)

    # ── ingestion ──────────────────────────────────────────────────────────────

    async def upsert_workout(self, user_id: int, data: dict) -> int:
        """
        Insert a Garmin workout, updating biomechanics/power fields on conflict.
        Returns the workout_id.
        """
        result = await self.db.execute(
            text("""
                INSERT INTO workouts (
                    user_id, sport, start_time, end_time, workout_type,
                    calories_burned, avg_heart_rate, max_heart_rate,
                    vo2max_estimate, lactate_threshold_bpm,
                    time_in_hr_zone_1, time_in_hr_zone_2, time_in_hr_zone_3,
                    time_in_hr_zone_4, time_in_hr_zone_5,
                    training_volume,
                    avg_vertical_oscillation, avg_ground_contact_time,
                    avg_stride_length, avg_vertical_ratio,
                    avg_running_cadence, max_running_cadence,
                    location, start_latitude, start_longitude, workout_date,
                    elevation_gain, elevation_loss,
                    aerobic_training_effect, anaerobic_training_effect,
                    training_stress_score, normalized_power,
                    avg_power, max_power, total_steps
                ) VALUES (
                    :user_id, :sport, :start_time, :end_time, :workout_type,
                    :calories_burned, :avg_heart_rate, :max_heart_rate,
                    :vo2max_estimate, :lactate_threshold_bpm,
                    :zone_1, :zone_2, :zone_3, :zone_4, :zone_5,
                    :training_volume,
                    :avg_vertical_oscillation, :avg_ground_contact_time,
                    :avg_stride_length, :avg_vertical_ratio,
                    :avg_running_cadence, :max_running_cadence,
                    :location, :start_latitude, :start_longitude, :workout_date,
                    :elevation_gain, :elevation_loss,
                    :aerobic_training_effect, :anaerobic_training_effect,
                    :training_stress_score, :normalized_power,
                    :avg_power, :max_power, :total_steps
                )
                ON CONFLICT (user_id, start_time) DO UPDATE SET
                    elevation_gain            = EXCLUDED.elevation_gain,
                    elevation_loss            = EXCLUDED.elevation_loss,
                    aerobic_training_effect   = EXCLUDED.aerobic_training_effect,
                    anaerobic_training_effect = EXCLUDED.anaerobic_training_effect,
                    training_stress_score     = EXCLUDED.training_stress_score,
                    normalized_power          = EXCLUDED.normalized_power,
                    avg_power                 = EXCLUDED.avg_power,
                    max_power                 = EXCLUDED.max_power,
                    total_steps               = EXCLUDED.total_steps
                RETURNING workout_id
            """),
            {
                "user_id": user_id,
                "sport": data["sport"],
                "start_time": data["start_time"],
                "end_time": data["end_time"],
                "workout_type": data["workout_type"],
                "calories_burned": data.get("calories_burned"),
                "avg_heart_rate": data.get("avg_heart_rate"),
                "max_heart_rate": data.get("max_heart_rate"),
                "vo2max_estimate": data.get("vo2max_estimate"),
                "lactate_threshold_bpm": data.get("lactate_threshold_bpm"),
                "zone_1": data.get("zone_1"), "zone_2": data.get("zone_2"),
                "zone_3": data.get("zone_3"), "zone_4": data.get("zone_4"),
                "zone_5": data.get("zone_5"),
                "training_volume": data.get("training_volume"),
                "avg_vertical_oscillation": data.get("avg_vertical_oscillation"),
                "avg_ground_contact_time": data.get("avg_ground_contact_time"),
                "avg_stride_length": data.get("avg_stride_length"),
                "avg_vertical_ratio": data.get("avg_vertical_ratio"),
                "avg_running_cadence": data.get("avg_running_cadence"),
                "max_running_cadence": data.get("max_running_cadence"),
                "location": data.get("location"),
                "start_latitude": data.get("start_latitude"),
                "start_longitude": data.get("start_longitude"),
                "workout_date": data["workout_date"],
                "elevation_gain": data.get("elevation_gain"),
                "elevation_loss": data.get("elevation_loss"),
                "aerobic_training_effect": data.get("aerobic_training_effect"),
                "anaerobic_training_effect": data.get("anaerobic_training_effect"),
                "training_stress_score": data.get("training_stress_score"),
                "normalized_power": data.get("normalized_power"),
                "avg_power": data.get("avg_power"),
                "max_power": data.get("max_power"),
                "total_steps": data.get("total_steps"),
            },
        )
        return result.scalar_one()