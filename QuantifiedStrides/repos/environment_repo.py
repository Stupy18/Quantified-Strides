from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class EnvironmentRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def exists_for_date(self, d: date) -> bool:
        result = await self.db.execute(
            text("SELECT 1 FROM environment_data WHERE record_datetime::date = :d LIMIT 1"),
            {"d": d},
        )
        return result.fetchone() is not None

    async def get_latest(self):
        """Most recent environment record — used by recommend engine and dashboard."""
        result = await self.db.execute(
            text("""
                SELECT temperature, precipitation, wind_speed
                FROM environment_data
                ORDER BY record_datetime DESC
                LIMIT 1
            """)
        )
        return result.fetchone()

    async def insert(self, workout_id: int | None, data: dict) -> None:
        await self.db.execute(
            text("""
                INSERT INTO environment_data (
                    workout_id, record_datetime, location,
                    temperature, wind_speed, wind_direction, humidity,
                    precipitation, grass_pollen, tree_pollen, weed_pollen,
                    uv_index, subjective_notes
                ) VALUES (
                    :workout_id, :record_datetime, :location,
                    :temperature, :wind_speed, :wind_direction, :humidity,
                    :precipitation, :grass_pollen, :tree_pollen, :weed_pollen,
                    :uv_index, :subjective_notes
                )
            """),
            {"workout_id": workout_id, **data},
        )
        await self.db.commit()