from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class StrengthRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── session list / lookup ──────────────────────────────────────────────────

    async def list_garmin_sessions(self, user_id: int, days: int = 90):
        """Garmin strength_training workouts joined with logged sessions."""
        result = await self.db.execute(
            text("""
                SELECT
                    w.workout_id,
                    w.workout_date,
                    w.start_time,
                    w.end_time,
                    w.calories_burned,
                    ss.session_id,
                    ss.session_type,
                    COUNT(DISTINCT se.exercise_id) AS total_exercises,
                    COUNT(st.set_id)               AS total_sets
                FROM workouts w
                LEFT JOIN strength_sessions ss
                       ON ss.user_id = w.user_id
                      AND ss.session_date = w.workout_date
                LEFT JOIN strength_exercises se ON se.session_id = ss.session_id
                LEFT JOIN strength_sets st      ON st.exercise_id = se.exercise_id
                WHERE w.user_id = :user_id
                  AND w.sport = 'strength_training'
                  AND w.workout_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                GROUP BY
                    w.workout_id, w.workout_date, w.start_time, w.end_time,
                    w.calories_burned, ss.session_id, ss.session_type
                ORDER BY w.workout_date DESC
            """),
            {"user_id": user_id, "days": days},
        )
        return result.fetchall()

    async def list_sessions(self, user_id: int, days: int = 90):
        result = await self.db.execute(
            text("""
                SELECT
                    ss.session_id,
                    ss.session_date,
                    ss.session_type,
                    COUNT(DISTINCT se.exercise_id) AS total_exercises,
                    COUNT(st.set_id)               AS total_sets
                FROM strength_sessions ss
                LEFT JOIN strength_exercises se ON se.session_id = ss.session_id
                LEFT JOIN strength_sets st      ON st.exercise_id = se.exercise_id
                WHERE ss.user_id = :user_id
                  AND ss.session_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                GROUP BY ss.session_id, ss.session_date, ss.session_type
                ORDER BY ss.session_date DESC
            """),
            {"user_id": user_id, "days": days},
        )
        return result.fetchall()

    async def get_session(self, user_id: int, session_id: int):
        result = await self.db.execute(
            text("""
                SELECT session_id, session_date, session_type, raw_notes
                FROM strength_sessions
                WHERE session_id = :session_id AND user_id = :user_id
            """),
            {"session_id": session_id, "user_id": user_id},
        )
        return result.fetchone()

    async def get_session_type_for_date(self, user_id: int, d: date):
        """Used by recommend engine to identify yesterday's gym session."""
        result = await self.db.execute(
            text("""
                SELECT session_type FROM strength_sessions
                WHERE user_id = :uid AND session_date = :d
            """),
            {"uid": user_id, "d": d},
        )
        return result.fetchone()

    async def had_session_on_date(self, user_id: int, d: date) -> bool:
        """Used by consecutive-days counter alongside workout_repo."""
        result = await self.db.execute(
            text("SELECT 1 FROM strength_sessions WHERE user_id = :uid AND session_date = :d LIMIT 1"),
            {"uid": user_id, "d": d},
        )
        return result.fetchone() is not None

    async def get_set_count_for_date(self, user_id: int, d: date) -> int:
        """Strength TRIMP fallback — set count when no Garmin HR data exists."""
        result = await self.db.execute(
            text("""
                SELECT COUNT(st.set_id)
                FROM strength_sessions ss
                JOIN strength_exercises se ON se.session_id = ss.session_id
                JOIN strength_sets st      ON st.exercise_id = se.exercise_id
                WHERE ss.user_id = :uid AND ss.session_date = :d
            """),
            {"uid": user_id, "d": d},
        )
        row = result.fetchone()
        return row[0] if row else 0

    async def get_weekly_volume(self, user_id: int, weeks: int = 12):
        result = await self.db.execute(
            text("""
                SELECT
                    date_trunc('week', session_date)::date AS week_start,
                    COUNT(DISTINCT session_date)           AS training_days,
                    COUNT(st.set_id)                       AS total_sets
                FROM strength_sessions ss
                JOIN strength_exercises se ON se.session_id = ss.session_id
                JOIN strength_sets st      ON st.exercise_id = se.exercise_id
                WHERE ss.user_id = :user_id
                  AND session_date >= CURRENT_DATE - (:weeks * INTERVAL '1 week')
                GROUP BY week_start
                ORDER BY week_start
            """),
            {"user_id": user_id, "weeks": weeks},
        )
        return result.fetchall()

    # ── exercises + sets ───────────────────────────────────────────────────────

    async def get_exercises(self, session_id: int):
        result = await self.db.execute(
            text("""
                SELECT exercise_id, exercise_order, name, notes
                FROM strength_exercises
                WHERE session_id = :session_id
                ORDER BY exercise_order
            """),
            {"session_id": session_id},
        )
        return result.fetchall()

    async def get_sets(self, exercise_id: int):
        result = await self.db.execute(
            text("""
                SELECT
                    set_id, set_number, reps, reps_min, reps_max,
                    duration_seconds, weight_kg, is_bodyweight, band_color,
                    per_hand, per_side, plus_bar, weight_includes_bar, total_weight_kg
                FROM strength_sets
                WHERE exercise_id = :exercise_id
                ORDER BY set_number
            """),
            {"exercise_id": exercise_id},
        )
        return result.fetchall()

    # ── session mutations ──────────────────────────────────────────────────────

    async def upsert_session(
        self, user_id: int, session_date: date, session_type: str, raw_notes: str | None
    ) -> int:
        result = await self.db.execute(
            text("""
                INSERT INTO strength_sessions (user_id, session_date, session_type, raw_notes)
                VALUES (:user_id, :session_date, :session_type, :raw_notes)
                ON CONFLICT (user_id, session_date) DO UPDATE SET
                    session_type = EXCLUDED.session_type,
                    raw_notes    = EXCLUDED.raw_notes
                RETURNING session_id
            """),
            {
                "user_id": user_id,
                "session_date": session_date,
                "session_type": session_type,
                "raw_notes": raw_notes,
            },
        )
        return result.fetchone().session_id

    async def delete_exercises(self, session_id: int) -> None:
        await self.db.execute(
            text("DELETE FROM strength_exercises WHERE session_id = :sid"),
            {"sid": session_id},
        )

    async def insert_session_exercise(
        self, session_id: int, exercise_order: int, name: str, notes: str | None
    ) -> int:
        result = await self.db.execute(
            text("""
                INSERT INTO strength_exercises (session_id, exercise_order, name, notes)
                VALUES (:sid, :order, :name, :notes)
                RETURNING exercise_id
            """),
            {"sid": session_id, "order": exercise_order, "name": name, "notes": notes},
        )
        return result.fetchone().exercise_id

    async def insert_set(self, exercise_id: int, data: dict) -> None:
        await self.db.execute(
            text("""
                INSERT INTO strength_sets (
                    exercise_id, set_number, reps, duration_seconds,
                    weight_kg, is_bodyweight, band_color,
                    per_hand, per_side, plus_bar,
                    weight_includes_bar, total_weight_kg
                ) VALUES (
                    :exercise_id, :set_number, :reps, :duration_seconds,
                    :weight_kg, :is_bodyweight, :band_color,
                    :per_hand, :per_side, :plus_bar,
                    :weight_includes_bar, :total_weight_kg
                )
            """),
            {"exercise_id": exercise_id, **data},
        )

    # ── 1RM + tracking ─────────────────────────────────────────────────────────

    async def get_1rm_history(self, user_id: int, exercise_name: str, days: int = 365):
        result = await self.db.execute(
            text("""
                SELECT
                    ss.session_date,
                    MAX(st.total_weight_kg * (1.0 + st.reps / 30.0)) AS epley_1rm
                FROM strength_sessions ss
                JOIN strength_exercises se ON se.session_id = ss.session_id
                JOIN strength_sets st      ON st.exercise_id = se.exercise_id
                WHERE ss.user_id = :user_id
                  AND LOWER(se.name) = LOWER(:exercise_name)
                  AND st.reps IS NOT NULL AND st.reps > 0
                  AND st.total_weight_kg IS NOT NULL AND st.total_weight_kg > 0
                  AND ss.session_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                GROUP BY ss.session_date
                ORDER BY ss.session_date
            """),
            {"user_id": user_id, "exercise_name": exercise_name, "days": days},
        )
        return result.fetchall()

    async def get_tracked_exercises(self, user_id: int) -> list[str]:
        result = await self.db.execute(
            text("""
                SELECT DISTINCT se.name
                FROM strength_exercises se
                JOIN strength_sessions ss ON ss.session_id = se.session_id
                WHERE ss.user_id = :user_id
                ORDER BY se.name
            """),
            {"user_id": user_id},
        )
        return [row.name for row in result.fetchall()]

    # ── intelligence queries ───────────────────────────────────────────────────

    async def get_strength_fatigue_data(self, user_id: int, start: date, until: date):
        """Per-exercise set counts + muscle data for fatigue decay (recovery.py)."""
        result = await self.db.execute(
            text("""
                SELECT ss.session_date,
                       e.primary_muscles,
                       e.secondary_muscles,
                       e.systemic_fatigue,
                       COUNT(st.set_id) AS num_sets
                FROM strength_sessions ss
                JOIN strength_exercises se ON se.session_id = ss.session_id
                LEFT JOIN exercises e      ON e.name = se.name
                JOIN strength_sets st      ON st.exercise_id = se.exercise_id
                WHERE ss.user_id = :uid
                  AND ss.session_date BETWEEN :start AND :until
                GROUP BY ss.session_date, se.exercise_id,
                         e.primary_muscles, e.secondary_muscles, e.systemic_fatigue
            """),
            {"uid": user_id, "start": start, "until": until},
        )
        return result.fetchall()

    async def get_gym_analysis(self, user_id: int, today: date):
        """Last 2 upper + 2 lower sessions with exercise metadata (recommend.py)."""
        result = await self.db.execute(
            text("""
                WITH ranked AS (
                    SELECT ss.session_id, ss.session_date, ss.session_type,
                           ROW_NUMBER() OVER (
                               PARTITION BY ss.session_type ORDER BY ss.session_date DESC
                           ) AS rn
                    FROM strength_sessions ss
                    WHERE ss.user_id = :uid AND ss.session_type IS NOT NULL
                      AND ss.session_date < :today
                )
                SELECT r.session_date, r.session_type,
                       e.movement_pattern, e.quality_focus,
                       e.primary_muscles, e.cns_load, e.systemic_fatigue
                FROM ranked r
                JOIN strength_exercises se ON se.session_id = r.session_id
                LEFT JOIN exercises e      ON e.name = se.name
                WHERE r.rn <= 2
                ORDER BY r.session_date DESC, se.exercise_order
            """),
            {"uid": user_id, "today": today},
        )
        return result.fetchall()

    async def get_last_performance(self, user_id: int, exercise_name: str):
        """Most recent sets for a given exercise (recommend.py progression logic)."""
        result = await self.db.execute(
            text("""
                SELECT st.set_number, st.reps, st.duration_seconds,
                       st.weight_kg, st.total_weight_kg, st.is_bodyweight,
                       st.band_color, st.per_hand, st.per_side
                FROM strength_sets st
                JOIN strength_exercises se ON st.exercise_id = se.exercise_id
                JOIN strength_sessions ss  ON se.session_id = ss.session_id
                WHERE se.name = :name
                  AND ss.user_id = :uid
                  AND ss.session_date = (
                      SELECT MAX(ss2.session_date)
                      FROM strength_exercises se2
                      JOIN strength_sessions ss2 ON se2.session_id = ss2.session_id
                      WHERE se2.name = :name AND ss2.user_id = :uid
                  )
                ORDER BY st.set_number
            """),
            {"name": exercise_name, "uid": user_id},
        )
        rows = result.fetchall()
        return rows if rows else None

    async def get_exercise_suggestions(
        self,
        user_id: int,
        focus_patterns: list[str],
        session_type: str,
        today: date,
    ):
        """
        Candidate exercises for the recommended gym session (recommend.py).
        Filtered by movement pattern, returns last_done date per exercise.
        """
        placeholders = ", ".join(f":p{i}" for i in range(len(focus_patterns)))
        params = {"uid": user_id, "today": today}
        for i, p in enumerate(focus_patterns):
            params[f"p{i}"] = p

        result = await self.db.execute(
            text(f"""
                SELECT e.name, e.movement_pattern, e.quality_focus, e.cns_load,
                       e.bilateral, e.primary_muscles,
                       MAX(ss.session_date) AS last_done,
                       e.contraction_type
                FROM exercises e
                LEFT JOIN strength_exercises se ON se.name = e.name
                LEFT JOIN strength_sessions ss
                       ON ss.session_id = se.session_id
                      AND ss.user_id = :uid
                WHERE e.movement_pattern IN ({placeholders})
                GROUP BY e.exercise_id
            """),
            params,
        )
        return result.fetchall()

    # ── exercise library ───────────────────────────────────────────────────────

    async def list_exercises(self, search: str | None = None):
        query = """
            SELECT
                exercise_id, name, source, movement_pattern, quality_focus,
                primary_muscles, secondary_muscles, equipment,
                skill_level, bilateral, contraction_type,
                systemic_fatigue, cns_load,
                joint_stress, sport_carryover, goal_carryover, notes
            FROM exercises
        """
        params: dict = {}
        if search:
            query += " WHERE LOWER(name) LIKE LOWER(:search)"
            params["search"] = f"%{search}%"
        query += " ORDER BY name"

        result = await self.db.execute(text(query), params)
        return result.fetchall()

    async def create_exercise(self, data: dict):
        result = await self.db.execute(
            text("""
                INSERT INTO exercises (
                    name, source, movement_pattern, quality_focus,
                    primary_muscles, secondary_muscles, equipment,
                    skill_level, bilateral, contraction_type,
                    systemic_fatigue, cns_load,
                    joint_stress, sport_carryover, goal_carryover, notes
                ) VALUES (
                    :name, :source, :movement_pattern, :quality_focus,
                    :primary_muscles, :secondary_muscles, :equipment,
                    :skill_level, :bilateral, :contraction_type,
                    :systemic_fatigue, :cns_load,
                    :joint_stress, :sport_carryover, :goal_carryover, :notes
                )
                RETURNING
                    exercise_id, name, source, movement_pattern, quality_focus,
                    primary_muscles, secondary_muscles, equipment,
                    skill_level, bilateral, contraction_type,
                    systemic_fatigue, cns_load,
                    joint_stress, sport_carryover, goal_carryover, notes
            """),
            data,
        )
        return result.fetchone()