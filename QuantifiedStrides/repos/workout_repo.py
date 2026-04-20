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
                w.workout_id, w.workout_date, w.sport, w.workout_type,
                w.start_time, w.end_time,
                EXTRACT(EPOCH FROM (w.end_time - w.start_time)) AS duration_s,
                w.distance_m,
                w.avg_heart_rate, w.max_heart_rate,
                w.calories_burned,
                ps.training_stress_score
            FROM workouts w
            LEFT JOIN workout_power_summary ps ON ps.workout_id = w.workout_id
            WHERE w.user_id = :user_id
              AND w.workout_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
        """
        params: dict = {"user_id": user_id, "days": days}

        if sport:
            query += " AND w.sport = :sport"
            params["sport"] = sport

        query += " ORDER BY w.workout_date DESC, w.start_time DESC"

        result = await self.db.execute(text(query), params)
        return result.fetchall()

    async def get_by_id(self, user_id: int, workout_id: int):
        result = await self.db.execute(
            text("""
                SELECT
                    w.workout_id, w.workout_date, w.sport, w.workout_type,
                    w.start_time, w.end_time,
                    EXTRACT(EPOCH FROM (w.end_time - w.start_time)) AS duration_s,
                    w.distance_m,
                    w.avg_heart_rate, w.max_heart_rate, w.calories_burned,
                    w.vo2max_estimate, w.lactate_threshold_bpm,
                    w.elevation_gain, w.elevation_loss,
                    w.aerobic_training_effect, w.anaerobic_training_effect,
                    w.total_steps,
                    w.location, w.start_latitude, w.start_longitude,
                    -- HR zones pivoted back
                    MAX(CASE WHEN hz.zone = 1 THEN hz.seconds END) AS time_in_hr_zone_1,
                    MAX(CASE WHEN hz.zone = 2 THEN hz.seconds END) AS time_in_hr_zone_2,
                    MAX(CASE WHEN hz.zone = 3 THEN hz.seconds END) AS time_in_hr_zone_3,
                    MAX(CASE WHEN hz.zone = 4 THEN hz.seconds END) AS time_in_hr_zone_4,
                    MAX(CASE WHEN hz.zone = 5 THEN hz.seconds END) AS time_in_hr_zone_5,
                    -- Power summary
                    ps.training_stress_score, ps.normalized_power,
                    ps.avg_power, ps.max_power,
                    -- Running biomechanics
                    rb.avg_running_cadence, rb.max_running_cadence,
                    rb.avg_stance_time, rb.avg_vertical_oscillation,
                    rb.avg_stride_length, rb.avg_vertical_ratio
                FROM workouts w
                LEFT JOIN workout_hr_zones hz      ON hz.workout_id = w.workout_id
                LEFT JOIN workout_power_summary ps  ON ps.workout_id = w.workout_id
                LEFT JOIN workout_run_biomechanics rb ON rb.workout_id = w.workout_id
                WHERE w.workout_id = :workout_id AND w.user_id = :user_id
                GROUP BY w.workout_id, ps.workout_id, rb.workout_id
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
        """Returns (zone, seconds) rows from workout_hr_zones for a given date (for TRIMP)."""
        result = await self.db.execute(
            text("""
                SELECT hz.zone, hz.seconds
                FROM workout_hr_zones hz
                JOIN workouts w ON w.workout_id = hz.workout_id
                WHERE w.user_id = :uid AND w.workout_date = :d
            """),
            {"uid": user_id, "d": d},
        )
        return result.fetchall()

    async def get_garmin_workout_for_date(self, user_id: int, d: date):
        """Most recent non-strength Garmin workout on a given date (for recommend)."""
        result = await self.db.execute(
            text("""
                SELECT sport, workout_type, distance_m, avg_heart_rate
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
                       SUM(distance_m) AS total_distance_m,
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

    async def get_running_workout_list(self, user_id: int, days: int = 365):
        """Running/trail workouts ordered by date — used by analytics trends functions."""
        result = await self.db.execute(
            text("""
                SELECT w.workout_id, w.workout_date, w.sport, w.distance_m,
                       w.avg_heart_rate, ps.normalized_power
                FROM workouts w
                LEFT JOIN workout_power_summary ps ON ps.workout_id = w.workout_id
                WHERE w.user_id = :uid
                  AND w.sport IN ('running', 'trail_running')
                  AND w.workout_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                ORDER BY w.workout_date
            """),
            {"uid": user_id, "days": days},
        )
        return result.fetchall()

    async def get_training_dates(self, user_id: int, start: date, until: date) -> set:
        """Set of all dates with any training activity — used by consecutive-days counter."""
        result = await self.db.execute(
            text("""
                SELECT workout_date AS d FROM workouts
                WHERE user_id = :uid AND workout_date BETWEEN :start AND :until
                UNION
                SELECT session_date FROM strength_sessions
                WHERE user_id = :uid AND session_date BETWEEN :start AND :until
            """),
            {"uid": user_id, "start": start, "until": until},
        )
        return {row[0] for row in result.fetchall()}

    async def get_endurance_fatigue_data(self, user_id: int, start: date, until: date):
        """Per-sport session data for muscle fatigue decay (recovery.py)."""
        result = await self.db.execute(
            text("""
                SELECT w.sport,
                       w.end_time,
                       w.workout_date,
                       EXTRACT(EPOCH FROM COALESCE(w.end_time - w.start_time,
                                                   INTERVAL '1 hour'))::float / 3600 AS duration_h,
                       ps.training_stress_score::float
                FROM workouts w
                LEFT JOIN workout_power_summary ps ON ps.workout_id = w.workout_id
                WHERE w.user_id = :uid
                  AND w.workout_date BETWEEN :start AND :until
                  AND w.sport != 'strength_training'
            """),
            {"uid": user_id, "start": start, "until": until},
        )
        return result.fetchall()

    # ── workout_metrics ────────────────────────────────────────────────────────

    async def get_metrics(self, workout_id: int):
        result = await self.db.execute(
            text("""
                SELECT
                    metric_timestamp, heart_rate, pace, cadence,
                    vertical_oscillation, vertical_ratio, stance_time,
                    power, latitude, longitude, altitude, distance, gradient_pct,
                    stride_length, grade_adjusted_pace, body_battery, vertical_speed,
                    speed_ms, grade_adjusted_speed_ms,
                    performance_condition, respiration_rate
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
                     vertical_oscillation, vertical_ratio, stance_time,
                     power, latitude, longitude, altitude, distance, gradient_pct,
                     stride_length, grade_adjusted_pace, body_battery, vertical_speed,
                     speed_ms, grade_adjusted_speed_ms,
                     performance_condition, respiration_rate)
        Returns count of rows inserted.
        """
        if not rows:
            return 0
        await self.db.execute(
            text("""
                INSERT INTO workout_metrics (
                    workout_id, metric_timestamp, heart_rate, pace, cadence,
                    vertical_oscillation, vertical_ratio, stance_time,
                    power, latitude, longitude, altitude, distance, gradient_pct,
                    stride_length, grade_adjusted_pace, body_battery, vertical_speed,
                    speed_ms, grade_adjusted_speed_ms,
                    performance_condition, respiration_rate
                ) VALUES (
                    :workout_id, :metric_timestamp, :heart_rate, :pace, :cadence,
                    :vertical_oscillation, :vertical_ratio, :stance_time,
                    :power, :latitude, :longitude, :altitude, :distance, :gradient_pct,
                    :stride_length, :grade_adjusted_pace, :body_battery, :vertical_speed,
                    :speed_ms, :grade_adjusted_speed_ms,
                    :performance_condition, :respiration_rate
                )
                ON CONFLICT (workout_id, metric_timestamp) DO NOTHING
            """),
            [
                {
                    "workout_id": r[0], "metric_timestamp": r[1], "heart_rate": r[2],
                    "pace": r[3], "cadence": r[4], "vertical_oscillation": r[5],
                    "vertical_ratio": r[6], "stance_time": r[7], "power": r[8],
                    "latitude": r[9], "longitude": r[10], "altitude": r[11],
                    "distance": r[12], "gradient_pct": r[13],
                    "stride_length": r[14], "grade_adjusted_pace": r[15],
                    "body_battery": r[16], "vertical_speed": r[17],
                    "speed_ms": r[18], "grade_adjusted_speed_ms": r[19],
                    "performance_condition": r[20], "respiration_rate": r[21],
                }
                for r in rows
            ],
        )
        return len(rows)

    # ── ingestion ──────────────────────────────────────────────────────────────

    async def upsert_workout(self, user_id: int, data: dict) -> int:
        """
        Insert a Garmin workout, updating fields on conflict.
        Returns the workout_id.
        """
        result = await self.db.execute(
            text("""
                INSERT INTO workouts (
                    user_id, sport, start_time, end_time, workout_type,
                    calories_burned, avg_heart_rate, max_heart_rate,
                    vo2max_estimate, lactate_threshold_bpm,
                    distance_m, avg_cadence,
                    location, start_latitude, start_longitude, workout_date,
                    elevation_gain, elevation_loss,
                    aerobic_training_effect, anaerobic_training_effect,
                    total_steps,
                    garmin_activity_id,
                    primary_benefit, training_load_score,
                    avg_respiration_rate, max_respiration_rate
                ) VALUES (
                    :user_id, :sport, :start_time, :end_time, :workout_type,
                    :calories_burned, :avg_heart_rate, :max_heart_rate,
                    :vo2max_estimate, :lactate_threshold_bpm,
                    :distance_m, :avg_cadence,
                    :location, :start_latitude, :start_longitude, :workout_date,
                    :elevation_gain, :elevation_loss,
                    :aerobic_training_effect, :anaerobic_training_effect,
                    :total_steps,
                    :garmin_activity_id,
                    :primary_benefit, :training_load_score,
                    :avg_respiration_rate, :max_respiration_rate
                )
                ON CONFLICT (user_id, start_time) DO UPDATE SET
                    elevation_gain            = EXCLUDED.elevation_gain,
                    elevation_loss            = EXCLUDED.elevation_loss,
                    aerobic_training_effect   = EXCLUDED.aerobic_training_effect,
                    anaerobic_training_effect = EXCLUDED.anaerobic_training_effect,
                    total_steps               = EXCLUDED.total_steps,
                    garmin_activity_id        = EXCLUDED.garmin_activity_id,
                    primary_benefit           = EXCLUDED.primary_benefit,
                    training_load_score       = EXCLUDED.training_load_score,
                    avg_respiration_rate      = EXCLUDED.avg_respiration_rate,
                    max_respiration_rate      = EXCLUDED.max_respiration_rate
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
                "distance_m":      data.get("distance_m"),
                "avg_cadence":     data.get("avg_cadence"),
                "location": data.get("location"),
                "start_latitude": data.get("start_latitude"),
                "start_longitude": data.get("start_longitude"),
                "workout_date": data["workout_date"],
                "elevation_gain": data.get("elevation_gain"),
                "elevation_loss": data.get("elevation_loss"),
                "aerobic_training_effect": data.get("aerobic_training_effect"),
                "anaerobic_training_effect": data.get("anaerobic_training_effect"),
                "total_steps": data.get("total_steps"),
                "garmin_activity_id": data.get("garmin_activity_id"),
                "primary_benefit": data.get("primary_benefit"),
                "training_load_score": data.get("training_load_score"),
                "avg_respiration_rate": data.get("avg_respiration_rate"),
                "max_respiration_rate": data.get("max_respiration_rate"),
            },
        )
        return result.scalar_one()

    async def upsert_hr_zones(self, workout_id: int, zones: dict) -> None:
        """
        Insert or update HR zone seconds for a workout.
        zones: {zone_number (int): seconds (int)}
        """
        if not zones:
            return
        await self.db.execute(
            text("""
                INSERT INTO workout_hr_zones (workout_id, zone, seconds)
                VALUES (:workout_id, :zone, :seconds)
                ON CONFLICT (workout_id, zone) DO UPDATE SET seconds = EXCLUDED.seconds
            """),
            [{"workout_id": workout_id, "zone": z, "seconds": s} for z, s in zones.items()],
        )

    async def upsert_run_biomechanics(self, workout_id: int, data: dict) -> None:
        """Insert or update running biomechanics summary for a workout."""
        if not any(data.values()):
            return
        await self.db.execute(
            text("""
                INSERT INTO workout_run_biomechanics (
                    workout_id, avg_vertical_oscillation, avg_stance_time,
                    avg_stride_length, avg_vertical_ratio,
                    avg_running_cadence, max_running_cadence
                ) VALUES (
                    :workout_id, :avg_vertical_oscillation, :avg_stance_time,
                    :avg_stride_length, :avg_vertical_ratio,
                    :avg_running_cadence, :max_running_cadence
                )
                ON CONFLICT (workout_id) DO UPDATE SET
                    avg_vertical_oscillation = EXCLUDED.avg_vertical_oscillation,
                    avg_stance_time  = EXCLUDED.avg_stance_time,
                    avg_stride_length        = EXCLUDED.avg_stride_length,
                    avg_vertical_ratio       = EXCLUDED.avg_vertical_ratio,
                    avg_running_cadence      = EXCLUDED.avg_running_cadence,
                    max_running_cadence      = EXCLUDED.max_running_cadence
            """),
            {
                "workout_id": workout_id,
                "avg_vertical_oscillation": data.get("avg_vertical_oscillation"),
                "avg_stance_time":  data.get("avg_stance_time"),
                "avg_stride_length":        data.get("avg_stride_length"),
                "avg_vertical_ratio":       data.get("avg_vertical_ratio"),
                "avg_running_cadence":      data.get("avg_running_cadence"),
                "max_running_cadence":      data.get("max_running_cadence"),
            },
        )

    async def upsert_power_summary(self, workout_id: int, data: dict) -> None:
        """Insert or update power/TSS summary for a workout."""
        if not any(data.values()):
            return
        await self.db.execute(
            text("""
                INSERT INTO workout_power_summary (
                    workout_id, normalized_power, avg_power, max_power, training_stress_score
                ) VALUES (
                    :workout_id, :normalized_power, :avg_power, :max_power, :training_stress_score
                )
                ON CONFLICT (workout_id) DO UPDATE SET
                    normalized_power      = EXCLUDED.normalized_power,
                    avg_power             = EXCLUDED.avg_power,
                    max_power             = EXCLUDED.max_power,
                    training_stress_score = EXCLUDED.training_stress_score
            """),
            {
                "workout_id": workout_id,
                "normalized_power":      data.get("normalized_power"),
                "avg_power":             data.get("avg_power"),
                "max_power":             data.get("max_power"),
                "training_stress_score": data.get("training_stress_score"),
            },
        )
