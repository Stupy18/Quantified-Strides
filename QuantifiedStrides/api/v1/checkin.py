from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from deps import get_checkin_repo, get_current_user_id
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
from services.checkin_service import CheckinService

router = APIRouter(prefix="/checkin", tags=["checkin"])
_svc = CheckinService()


# ------------------------------------------------------------------
# Daily readiness
# ------------------------------------------------------------------

@router.post("/readiness", response_model=DailyReadinessSchema, status_code=201)
async def create_readiness(
    payload: DailyReadinessCreateSchema,
    user_id: int = Depends(get_current_user_id),
    repo: CheckinRepo = Depends(get_checkin_repo),
):
    return await _svc.create_readiness(repo, user_id, payload)


@router.get("/readiness/{entry_date}", response_model=DailyReadinessSchema)
async def get_readiness(
    entry_date: date,
    user_id: int = Depends(get_current_user_id),
    repo: CheckinRepo = Depends(get_checkin_repo),
):
    result = await _svc.get_readiness(repo, user_id, entry_date)
    if not result:
        raise HTTPException(status_code=404, detail="Readiness entry not found")
    return result


# ------------------------------------------------------------------
# Workout reflection
# ------------------------------------------------------------------

@router.post("/reflection", response_model=WorkoutReflectionSchema, status_code=201)
async def create_reflection(
    payload: WorkoutReflectionCreateSchema,
    user_id: int = Depends(get_current_user_id),
    repo: CheckinRepo = Depends(get_checkin_repo),
):
    return await _svc.create_reflection(repo, user_id, payload)


@router.get("/reflection/{entry_date}", response_model=WorkoutReflectionSchema)
async def get_reflection(
    entry_date: date,
    user_id: int = Depends(get_current_user_id),
    repo: CheckinRepo = Depends(get_checkin_repo),
):
    result = await _svc.get_reflection(repo, user_id, entry_date)
    if not result:
        raise HTTPException(status_code=404, detail="Workout reflection not found")
    return result


# ------------------------------------------------------------------
# Journal
# ------------------------------------------------------------------

@router.post("/journal", response_model=JournalEntrySchema, status_code=201)
async def upsert_journal(
    payload: JournalEntryCreateSchema,
    user_id: int = Depends(get_current_user_id),
    repo: CheckinRepo = Depends(get_checkin_repo),
):
    return await _svc.upsert_journal(repo, user_id, payload)


@router.get("/journal/{entry_date}", response_model=JournalEntrySchema)
async def get_journal(
    entry_date: date,
    user_id: int = Depends(get_current_user_id),
    repo: CheckinRepo = Depends(get_checkin_repo),
):
    result = await _svc.get_journal(repo, user_id, entry_date)
    if not result:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return result


# ------------------------------------------------------------------
# History (joined view)
# ------------------------------------------------------------------

@router.get("/history", response_model=list[JournalHistoryRowSchema])
async def get_history(
    days: int = Query(default=90, ge=7, le=365),
    user_id: int = Depends(get_current_user_id),
    repo: CheckinRepo = Depends(get_checkin_repo),
):
    return await _svc.get_history(repo, user_id, days)