from sqlalchemy.ext.asyncio import AsyncSession


class SleepRepo:
    def __init__(self, db: AsyncSession):
        self.db = db
