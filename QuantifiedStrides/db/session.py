import psycopg2
from core.config import DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, create_async_engine
from sqlalchemy.orm import sessionmaker


def get_connection():
    """Return a new psycopg2 connection to QuantifiedStrides DB."""
    return psycopg2.connect(
        host=DB_HOST,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )



# Async SQLAlchemy session factory — used by FastAPI endpoints and async scripts.
# The old get_connection() above stays intact until all legacy scripts are migrated.
DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal: sessionmaker = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
