"""
CheckinService

CRUD for the three daily check-in tables:
  daily_readiness    — morning readiness (overall feel, legs, joints, time, going_out)
  workout_reflection — post-workout RPE + quality
  journal_entries    — free-text daily journal
"""

from datetime import date

from models.checkin import (
    DailyReadinessCreateSchema,
    DailyReadinessSchema,
    JournalEntryCreateSchema,
    JournalEntrySchema,
    JournalHistoryRowSchema,
    WorkoutReflectionCreateSchema,
    WorkoutReflectionSchema,
)
from repos.checkin_repo import CheckinRepo


class CheckinService:

    # ------------------------------------------------------------------
    # Daily readiness
    # ------------------------------------------------------------------

    async def create_readiness(
        self, repo: CheckinRepo, user_id: int, payload: DailyReadinessCreateSchema
    ) -> DailyReadinessSchema:
        row = await repo.upsert_readiness(user_id, {
            "entry_date":       payload.entry_date,
            "overall_feel":     payload.overall_feel,
            "legs_feel":        payload.legs_feel,
            "upper_body_feel":  payload.upper_body_feel,
            "joint_feel":       payload.joint_feel,
            "injury_note":      payload.injury_note,
            "time_available":   payload.time_available,
            "going_out_tonight": payload.going_out_tonight,
        })
        await repo.db.commit()
        return self._map_readiness(row)

    async def get_readiness(
        self, repo: CheckinRepo, user_id: int, entry_date: date
    ) -> DailyReadinessSchema | None:
        row = await repo.get_readiness(user_id, entry_date)
        return self._map_readiness(row) if row else None

    def _map_readiness(self, row) -> DailyReadinessSchema:
        return DailyReadinessSchema(
            readiness_id=row.readiness_id,
            user_id=row.user_id,
            entry_date=row.entry_date,
            overall_feel=row.overall_feel,
            legs_feel=row.legs_feel,
            upper_body_feel=row.upper_body_feel,
            joint_feel=row.joint_feel,
            injury_note=row.injury_note,
            time_available=row.time_available,
            going_out_tonight=row.going_out_tonight or False,
        )

    # ------------------------------------------------------------------
    # Workout reflection
    # ------------------------------------------------------------------

    async def create_reflection(
        self, repo: CheckinRepo, user_id: int, payload: WorkoutReflectionCreateSchema
    ) -> WorkoutReflectionSchema:
        row = await repo.upsert_reflection(user_id, {
            "entry_date":      payload.entry_date,
            "session_rpe":     payload.session_rpe,
            "session_quality": payload.session_quality,
            "notes":           payload.notes,
            "load_feel":       payload.load_feel,
            "workout_id":      payload.workout_id,
        })
        await repo.db.commit()
        return self._map_reflection(row)

    async def get_reflection(
        self, repo: CheckinRepo, user_id: int, entry_date: date
    ) -> WorkoutReflectionSchema | None:
        row = await repo.get_reflection(user_id, entry_date)
        return self._map_reflection(row) if row else None

    def _map_reflection(self, row) -> WorkoutReflectionSchema:
        return WorkoutReflectionSchema(
            reflection_id=row.reflection_id,
            user_id=row.user_id,
            entry_date=row.entry_date,
            session_rpe=row.session_rpe,
            session_quality=row.session_quality,
            notes=row.notes,
            load_feel=row.load_feel,
            workout_id=getattr(row, "workout_id", None),
        )

    # ------------------------------------------------------------------
    # Journal entries
    # ------------------------------------------------------------------

    async def upsert_journal(
        self, repo: CheckinRepo, user_id: int, payload: JournalEntryCreateSchema
    ) -> JournalEntrySchema:
        await repo.ensure_journal_table()
        row = await repo.upsert_journal(user_id, {
            "entry_date": payload.entry_date,
            "content":    payload.content,
        })
        await repo.db.commit()
        return JournalEntrySchema(
            entry_id=row.entry_id,
            user_id=row.user_id,
            entry_date=row.entry_date,
            content=row.content,
        )

    async def get_journal(
        self, repo: CheckinRepo, user_id: int, entry_date: date
    ) -> JournalEntrySchema | None:
        await repo.ensure_journal_table()
        await repo.db.commit()
        row = await repo.get_journal(user_id, entry_date)
        if not row:
            return None
        return JournalEntrySchema(
            entry_id=row.entry_id,
            user_id=row.user_id,
            entry_date=row.entry_date,
            content=row.content,
        )

    # ------------------------------------------------------------------
    # History (joined view)
    # ------------------------------------------------------------------

    async def get_history(
        self, repo: CheckinRepo, user_id: int, days: int = 90
    ) -> list[JournalHistoryRowSchema]:
        rows = await repo.get_history(user_id, days)
        return [
            JournalHistoryRowSchema(
                entry_date=row.entry_date,
                overall=row.overall_feel,
                legs=row.legs_feel,
                upper=row.upper_body_feel,
                joints=row.joint_feel,
                injury_note=row.injury_note,
                time_available=row.time_available,
                going_out=row.going_out_tonight,
                rpe=row.session_rpe,
                session_quality=row.session_quality,
                load_feel=row.load_feel,
                reflection_notes=row.reflection_notes,
                journal_note=row.journal_note,
            )
            for row in rows
        ]