from fastapi import APIRouter, Depends, HTTPException, Query

from deps import get_current_user_id, get_strength_repo, get_strength_service
from models.strength import (
    ExerciseCreateSchema,
    ExerciseSchema,
    OneRMPointSchema,
    StrengthSessionCreateSchema,
    StrengthSessionListItemSchema,
    StrengthSessionSchema,
    StrengthWorkoutSchema,
)
from repos.strength_repo import StrengthRepo
from services.strength_service import StrengthService

router = APIRouter(prefix="/strength", tags=["strength"])


# ------------------------------------------------------------------
# Sessions
# ------------------------------------------------------------------

@router.get("/workouts", response_model=list[StrengthWorkoutSchema])
async def list_garmin_sessions(
    days: int = Query(default=90, ge=7, le=365),
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    return await svc.list_garmin_sessions(repo, user_id, days)


@router.get("/sessions", response_model=list[StrengthSessionListItemSchema])
async def list_sessions(
    days: int = Query(default=90, ge=7, le=365),
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    return await svc.list_sessions(repo, user_id, days)


@router.post("/sessions", response_model=StrengthSessionSchema, status_code=201)
async def create_session(
    payload: StrengthSessionCreateSchema,
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    return await svc.create_session(repo, user_id, payload)


@router.get("/sessions/{session_id}", response_model=StrengthSessionSchema)
async def get_session_detail(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    result = await svc.get_session_detail(repo, user_id, session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Strength session not found")
    return result


# ------------------------------------------------------------------
# 1RM progression
# ------------------------------------------------------------------

@router.get("/1rm", response_model=list[OneRMPointSchema])
async def get_1rm_history(
    exercise: str = Query(..., description="Exercise name (case-insensitive)"),
    days: int = Query(default=365, ge=30, le=730),
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    return await svc.get_1rm_history(repo, user_id, exercise, days)


@router.get("/1rm/exercises", response_model=list[str])
async def get_tracked_exercises(
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    return await svc.get_tracked_exercises(repo, user_id)


# ------------------------------------------------------------------
# Exercise library
# ------------------------------------------------------------------

@router.get("/exercises", response_model=list[ExerciseSchema])
async def list_exercises(
    search: str | None = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    return await svc.list_exercises(repo, search)


@router.post("/exercises", response_model=ExerciseSchema, status_code=201)
async def create_exercise(
    payload: ExerciseCreateSchema,
    user_id: int = Depends(get_current_user_id),
    repo: StrengthRepo = Depends(get_strength_repo),
    svc: StrengthService = Depends(get_strength_service),
):
    return await svc.create_exercise(repo, payload)