from fastapi import APIRouter, Depends, HTTPException, Query

from deps import get_current_user_id, get_sleep_repo
from models.sleep import SleepDetailSchema, SleepListItemSchema, SleepTrendPointSchema
from repos.sleep_repo import SleepRepo
from services.sleep_service import SleepService

router = APIRouter(prefix="/sleep", tags=["sleep"])
_svc = SleepService()


@router.get("", response_model=list[SleepListItemSchema])
async def list_sleep(
    days: int = Query(default=90, ge=7, le=365),
    user_id: int = Depends(get_current_user_id),
    repo: SleepRepo = Depends(get_sleep_repo),
):
    return await _svc.list_sleep(repo, user_id, days)


@router.get("/trends", response_model=list[SleepTrendPointSchema])
async def get_sleep_trends(
    days: int = Query(default=90, ge=7, le=365),
    user_id: int = Depends(get_current_user_id),
    repo: SleepRepo = Depends(get_sleep_repo),
):
    return await _svc.get_sleep_trends(repo, user_id, days)


@router.get("/{sleep_id}", response_model=SleepDetailSchema)
async def get_sleep_detail(
    sleep_id: int,
    user_id: int = Depends(get_current_user_id),
    repo: SleepRepo = Depends(get_sleep_repo),
):
    result = await _svc.get_sleep_detail(repo, user_id, sleep_id)
    if not result:
        raise HTTPException(status_code=404, detail="Sleep session not found")
    return result