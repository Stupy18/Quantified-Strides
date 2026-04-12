from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class NarrativeRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_cached(self, user_id: int, today: date, cache_key: str) -> str | None:
        result = await self.db.execute(
            text("""
                SELECT narrative FROM narrative_cache
                WHERE user_id = :uid AND date = :d AND cache_key = :k
            """),
            {"uid": user_id, "d": today, "k": cache_key},
        )
        row = result.fetchone()
        return row.narrative if row else None

    async def upsert_cache(
        self, user_id: int, today: date, cache_key: str, narrative: str
    ) -> None:
        await self.db.execute(
            text("""
                INSERT INTO narrative_cache (user_id, date, cache_key, narrative)
                VALUES (:uid, :d, :k, :n)
                ON CONFLICT (user_id, date) DO UPDATE
                    SET cache_key  = EXCLUDED.cache_key,
                        narrative  = EXCLUDED.narrative,
                        created_at = NOW()
            """),
            {"uid": user_id, "d": today, "k": cache_key, "n": narrative},
        )
        await self.db.commit()