from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_current_user_id, get_dashboard_service
from models.dashboard import DashboardSchema
from services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSchema)
async def get_dashboard(
    today: date = Query(default_factory=date.today),
    user_id: int = Depends(get_current_user_id),
    svc: DashboardService = Depends(get_dashboard_service),
):
    return await svc.get_dashboard(user_id, today)