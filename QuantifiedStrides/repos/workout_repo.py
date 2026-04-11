from sqlalchemy.ext.asyncio import AsyncSession


class WorkoutRepo:
    def __init__(self, db: AsyncSession):
        self.db = db