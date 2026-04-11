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