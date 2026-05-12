from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class CheckinRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── daily_readiness ────────────────────────────────────────────────────────

    async def upsert_readiness(self, user_id: int, data: dict):
        result = await self.db.execute(
            text("""
                INSERT INTO daily_readiness (
                    user_id, entry_date, overall_feel, legs_feel,
                    upper_body_feel, joint_feel, injury_note,
                    time_available, going_out_tonight
                ) VALUES (
                    :user_id, :entry_date, :overall_feel, :legs_feel,
                    :upper_body_feel, :joint_feel, :injury_note,
                    :time_available, :going_out_tonight
                )
                ON CONFLICT (user_id, entry_date) DO UPDATE SET
                    overall_feel      = EXCLUDED.overall_feel,
                    legs_feel         = EXCLUDED.legs_feel,
                    upper_body_feel   = EXCLUDED.upper_body_feel,
                    joint_feel        = EXCLUDED.joint_feel,
                    injury_note       = EXCLUDED.injury_note,
                    time_available    = EXCLUDED.time_available,
                    going_out_tonight = EXCLUDED.going_out_tonight
                RETURNING
                    readiness_id, user_id, entry_date, overall_feel, legs_feel,
                    upper_body_feel, joint_feel, injury_note,
                    time_available, going_out_tonight
            """),
            {"user_id": user_id, **data},
        )
        return result.fetchone()

    async def get_readiness(self, user_id: int, entry_date: date):
        result = await self.db.execute(
            text("""
                SELECT readiness_id, user_id, entry_date, overall_feel, legs_feel,
                       upper_body_feel, joint_feel, injury_note,
                       time_available, going_out_tonight
                FROM daily_readiness
                WHERE user_id = :user_id AND entry_date = :entry_date
            """),
            {"user_id": user_id, "entry_date": entry_date},
        )
        return result.fetchone()

    async def get_going_out(self, user_id: int, d: date) -> bool:
        """Used by alerts engine to check if user went out last night."""
        result = await self.db.execute(
            text("SELECT going_out_tonight FROM daily_readiness WHERE user_id = :uid AND entry_date = :d"),
            {"uid": user_id, "d": d},
        )
        row = result.fetchone()
        return bool(row and row.going_out_tonight)

    # ── workout_reflection ─────────────────────────────────────────────────────

    async def upsert_reflection(self, user_id: int, data: dict):
        result = await self.db.execute(
            text("""
                INSERT INTO workout_reflection (
                    user_id, entry_date, session_rpe, session_quality, notes, load_feel, workout_id
                ) VALUES (
                    :user_id, :entry_date, :session_rpe, :session_quality, :notes, :load_feel, :workout_id
                )
                ON CONFLICT (user_id, entry_date) DO UPDATE SET
                    session_rpe     = EXCLUDED.session_rpe,
                    session_quality = EXCLUDED.session_quality,
                    notes           = EXCLUDED.notes,
                    load_feel       = EXCLUDED.load_feel,
                    workout_id      = COALESCE(EXCLUDED.workout_id, workout_reflection.workout_id)
                RETURNING
                    reflection_id, user_id, entry_date, session_rpe, session_quality,
                    notes, load_feel, workout_id
            """),
            {"user_id": user_id, "workout_id": data.get("workout_id"), **data},
        )
        return result.fetchone()

    async def get_reflection(self, user_id: int, entry_date: date):
        result = await self.db.execute(
            text("""
                SELECT reflection_id, user_id, entry_date, session_rpe, session_quality,
                       notes, load_feel, workout_id
                FROM workout_reflection
                WHERE user_id = :user_id AND entry_date = :entry_date
            """),
            {"user_id": user_id, "entry_date": entry_date},
        )
        return result.fetchone()

    async def get_load_feel(self, user_id: int, d: date) -> int | None:
        """load_feel for yesterday's session — used by recommend engine."""
        result = await self.db.execute(
            text("SELECT load_feel FROM workout_reflection WHERE user_id = :uid AND entry_date = :d"),
            {"uid": user_id, "d": d},
        )
        row = result.fetchone()
        return row.load_feel if row else None

    # ── journal_entries ────────────────────────────────────────────────────────

    async def ensure_journal_table(self) -> None:
        await self.db.execute(text("""
            CREATE TABLE IF NOT EXISTS journal_entries (
                entry_id   SERIAL PRIMARY KEY,
                user_id    INT  NOT NULL,
                entry_date DATE NOT NULL,
                content    TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                UNIQUE (user_id, entry_date)
            )
        """))

    async def upsert_journal(self, user_id: int, data: dict):
        result = await self.db.execute(
            text("""
                INSERT INTO journal_entries (user_id, entry_date, content)
                VALUES (:user_id, :entry_date, :content)
                ON CONFLICT (user_id, entry_date) DO UPDATE SET
                    content    = EXCLUDED.content,
                    created_at = now()
                RETURNING entry_id, user_id, entry_date, content
            """),
            {"user_id": user_id, **data},
        )
        return result.fetchone()

    async def get_journal(self, user_id: int, entry_date: date):
        result = await self.db.execute(
            text("""
                SELECT entry_id, user_id, entry_date, content
                FROM journal_entries
                WHERE user_id = :user_id AND entry_date = :entry_date
            """),
            {"user_id": user_id, "entry_date": entry_date},
        )
        return result.fetchone()

    # ── history (joined view) ──────────────────────────────────────────────────

    async def get_history(self, user_id: int, days: int = 90):
        result = await self.db.execute(
            text("""
                SELECT
                    d.entry_date,
                    r.overall_feel, r.legs_feel, r.upper_body_feel, r.joint_feel,
                    r.injury_note, r.time_available, r.going_out_tonight,
                    wr.session_rpe, wr.session_quality, wr.load_feel,
                    wr.notes AS reflection_notes,
                    je.content AS journal_note
                FROM (
                    SELECT entry_date FROM daily_readiness
                    WHERE user_id = :uid AND entry_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                    UNION
                    SELECT entry_date FROM workout_reflection
                    WHERE user_id = :uid AND entry_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                    UNION
                    SELECT entry_date FROM journal_entries
                    WHERE user_id = :uid AND entry_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                ) d
                LEFT JOIN daily_readiness r
                    ON r.entry_date = d.entry_date AND r.user_id = :uid
                LEFT JOIN workout_reflection wr
                    ON wr.entry_date = d.entry_date AND wr.user_id = :uid
                LEFT JOIN journal_entries je
                    ON je.entry_date = d.entry_date AND je.user_id = :uid
                ORDER BY d.entry_date DESC
            """),
            {"uid": user_id, "days": days},
        )
        return result.fetchall()