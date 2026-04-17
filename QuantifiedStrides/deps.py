"""
Database and auth dependency injection for FastAPI.

Provides:
  get_db()             — async SQLAlchemy session
  get_current_user_id()— decodes user_id from JWT Bearer token
  get_user_repo()      — UserRepo instance scoped to the request session
"""

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.settings import settings
from services.auth import decode_token

engine = create_async_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    echo=settings.db_echo,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

_bearer = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> int:
    try:
        return decode_token(credentials.credentials)
    except (JWTError, Exception):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── repo factories ─────────────────────────────────────────────────────────────

def get_user_repo(db: AsyncSession = Depends(get_db)):
    from repos.user_repo import UserRepo
    return UserRepo(db)


def get_workout_repo(db: AsyncSession = Depends(get_db)):
    from repos.workout_repo import WorkoutRepo
    return WorkoutRepo(db)


def get_strength_repo(db: AsyncSession = Depends(get_db)):
    from repos.strength_repo import StrengthRepo
    return StrengthRepo(db)


def get_checkin_repo(db: AsyncSession = Depends(get_db)):
    from repos.checkin_repo import CheckinRepo
    return CheckinRepo(db)


def get_sleep_repo(db: AsyncSession = Depends(get_db)):
    from repos.sleep_repo import SleepRepo
    return SleepRepo(db)


def get_workout_metrics_repo(db: AsyncSession = Depends(get_db)):
    from repos.workout_metrics_repo import WorkoutMetricsRepo
    return WorkoutMetricsRepo(db)


def get_running_service(
    metrics_repo=Depends(get_workout_metrics_repo),
    workout_repo=Depends(get_workout_repo),
):
    from services.running import RunningService
    return RunningService(metrics_repo, workout_repo)


def get_dashboard_service(db: AsyncSession = Depends(get_db)):
    from services.dashboard import DashboardService
    return DashboardService(db)