"""
AlertsService

Wraps alerts.py intelligence module.
Today: rule-based anomaly detection (ACWR, HRV, RHR, sleep, TSB, consecutive days).
Tomorrow: extend or replace with learned anomaly detection
          without touching DashboardService.
"""

from datetime import date

from models.dashboard import AlertSchema

from intelligence.alerts import get_alerts
from repos.sleep_repo import SleepRepo
from repos.workout_repo import WorkoutRepo
from repos.checkin_repo import CheckinRepo


class AlertsService:

    def __init__(
        self,
        sleep_repo: SleepRepo,
        workout_repo: WorkoutRepo,
        checkin_repo: CheckinRepo,
    ):
        self._sleep_repo   = sleep_repo
        self._workout_repo = workout_repo
        self._checkin_repo = checkin_repo

    async def get_alerts(
        self,
        today: date,
        tl_metrics: dict,
        hrv_status: dict,
        readiness: dict | None = None,
        user_id: int = 1,
    ) -> list[AlertSchema]:
        raw = await get_alerts(
            self._sleep_repo,
            self._workout_repo,
            self._checkin_repo,
            today,
            tl_metrics,
            hrv_status,
            readiness,
            user_id,
        )
        return [AlertSchema(severity=sev, message=msg) for sev, msg in raw]