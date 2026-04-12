"""
StrengthService

Strength session list/detail, 1RM progression, and exercise library.
"""

from models.strength import (
    ExerciseCreateSchema,
    ExerciseSchema,
    OneRMPointSchema,
    StrengthExerciseSchema,
    StrengthSessionCreateSchema,
    StrengthSessionListItemSchema,
    StrengthSessionSchema,
    StrengthSetSchema,
    StrengthWorkoutSchema,
)
from repos.strength_repo import StrengthRepo


class StrengthService:

    # ------------------------------------------------------------------
    # Merged Garmin workouts + logged sessions
    # ------------------------------------------------------------------

    async def list_garmin_sessions(
        self, repo: StrengthRepo, user_id: int, days: int = 90
    ) -> list[StrengthWorkoutSchema]:
        rows = await repo.list_garmin_sessions(user_id, days)
        out = []
        for row in rows:
            duration = None
            if row.start_time and row.end_time:
                duration = round((row.end_time - row.start_time).total_seconds() / 60, 0)
            out.append(StrengthWorkoutSchema(
                workout_id=row.workout_id,
                workout_date=row.workout_date,
                duration_min=duration,
                calories=row.calories_burned,
                session_id=row.session_id,
                session_type=row.session_type,
                total_exercises=row.total_exercises,
                total_sets=row.total_sets,
            ))
        return out

    # ------------------------------------------------------------------
    # Session list
    # ------------------------------------------------------------------

    async def list_sessions(
        self, repo: StrengthRepo, user_id: int, days: int = 90
    ) -> list[StrengthSessionListItemSchema]:
        rows = await repo.list_sessions(user_id, days)
        return [
            StrengthSessionListItemSchema(
                session_id=row.session_id,
                session_date=row.session_date,
                session_type=row.session_type,
                total_exercises=row.total_exercises,
                total_sets=row.total_sets,
            )
            for row in rows
        ]

    # ------------------------------------------------------------------
    # Session detail
    # ------------------------------------------------------------------

    async def get_session_detail(
        self, repo: StrengthRepo, user_id: int, session_id: int
    ) -> StrengthSessionSchema | None:
        row = await repo.get_session(user_id, session_id)
        if not row:
            return None

        exercises = await self._get_exercises(repo, session_id)

        return StrengthSessionSchema(
            session_id=row.session_id,
            session_date=row.session_date,
            session_type=row.session_type,
            raw_notes=row.raw_notes,
            exercises=exercises,
        )

    async def _get_exercises(
        self, repo: StrengthRepo, session_id: int
    ) -> list[StrengthExerciseSchema]:
        exercises = []
        for row in await repo.get_exercises(session_id):
            sets = await self._get_sets(repo, row.exercise_id)
            exercises.append(StrengthExerciseSchema(
                exercise_id=row.exercise_id,
                exercise_order=row.exercise_order,
                name=row.name,
                notes=row.notes,
                sets=sets,
            ))
        return exercises

    async def _get_sets(
        self, repo: StrengthRepo, exercise_id: int
    ) -> list[StrengthSetSchema]:
        return [
            StrengthSetSchema(
                set_id=row.set_id,
                set_number=row.set_number,
                reps=row.reps,
                reps_min=row.reps_min,
                reps_max=row.reps_max,
                duration_seconds=row.duration_seconds,
                weight_kg=row.weight_kg,
                is_bodyweight=row.is_bodyweight or False,
                band_color=row.band_color,
                per_hand=row.per_hand or False,
                per_side=row.per_side or False,
                plus_bar=row.plus_bar or False,
                weight_includes_bar=row.weight_includes_bar or False,
                total_weight_kg=row.total_weight_kg,
            )
            for row in await repo.get_sets(exercise_id)
        ]

    # ------------------------------------------------------------------
    # Session creation (manual log)
    # ------------------------------------------------------------------

    async def create_session(
        self, repo: StrengthRepo, user_id: int, payload: StrengthSessionCreateSchema
    ) -> StrengthSessionSchema:
        session_id = await repo.upsert_session(
            user_id, payload.session_date, payload.session_type, payload.raw_notes
        )
        await repo.delete_exercises(session_id)

        for ex in payload.exercises:
            exercise_id = await repo.insert_session_exercise(
                session_id, ex.exercise_order, ex.name, ex.notes
            )
            for s in ex.sets:
                await repo.insert_set(exercise_id, {
                    "set_number":          s.set_number,
                    "reps":                s.reps,
                    "duration_seconds":    s.duration_seconds,
                    "weight_kg":           s.weight_kg,
                    "is_bodyweight":       s.is_bodyweight,
                    "band_color":          s.band_color,
                    "per_hand":            s.per_hand,
                    "per_side":            s.per_side,
                    "plus_bar":            s.plus_bar,
                    "weight_includes_bar": s.weight_includes_bar,
                    "total_weight_kg":     s.total_weight_kg,
                })

        await repo.db.commit()
        return await self.get_session_detail(repo, user_id, session_id)

    # ------------------------------------------------------------------
    # 1RM progression (Epley formula)
    # ------------------------------------------------------------------

    async def get_1rm_history(
        self, repo: StrengthRepo, user_id: int, exercise_name: str, days: int = 365
    ) -> list[OneRMPointSchema]:
        rows = await repo.get_1rm_history(user_id, exercise_name, days)
        return [
            OneRMPointSchema(
                session_date=row.session_date,
                epley_1rm=round(float(row.epley_1rm), 1),
            )
            for row in rows
        ]

    async def get_tracked_exercises(self, repo: StrengthRepo, user_id: int) -> list[str]:
        return await repo.get_tracked_exercises(user_id)

    # ------------------------------------------------------------------
    # Exercise library
    # ------------------------------------------------------------------

    async def list_exercises(
        self, repo: StrengthRepo, search: str | None = None
    ) -> list[ExerciseSchema]:
        rows = await repo.list_exercises(search)
        return [self._map_exercise(row) for row in rows]

    async def create_exercise(
        self, repo: StrengthRepo, payload: ExerciseCreateSchema
    ) -> ExerciseSchema:
        row = await repo.create_exercise({
            "name":             payload.name,
            "source":           payload.source,
            "movement_pattern": payload.movement_pattern,
            "quality_focus":    payload.quality_focus,
            "primary_muscles":  payload.primary_muscles,
            "secondary_muscles": payload.secondary_muscles,
            "equipment":        payload.equipment,
            "skill_level":      payload.skill_level,
            "bilateral":        payload.bilateral,
            "contraction_type": payload.contraction_type,
            "systemic_fatigue": payload.systemic_fatigue,
            "cns_load":         payload.cns_load,
            "joint_stress":     payload.joint_stress,
            "sport_carryover":  payload.sport_carryover,
            "goal_carryover":   payload.goal_carryover,
            "notes":            payload.notes,
        })
        await repo.db.commit()
        return self._map_exercise(row)

    def _map_exercise(self, row) -> ExerciseSchema:
        return ExerciseSchema(
            exercise_id=row.exercise_id,
            name=row.name,
            source=row.source,
            movement_pattern=row.movement_pattern,
            quality_focus=row.quality_focus,
            primary_muscles=row.primary_muscles or [],
            secondary_muscles=row.secondary_muscles or [],
            equipment=row.equipment or [],
            skill_level=row.skill_level,
            bilateral=row.bilateral if row.bilateral is not None else True,
            contraction_type=row.contraction_type,
            systemic_fatigue=row.systemic_fatigue,
            cns_load=row.cns_load,
            joint_stress=row.joint_stress or {},
            sport_carryover=row.sport_carryover or {},
            goal_carryover=row.goal_carryover or {},
            notes=row.notes,
        )