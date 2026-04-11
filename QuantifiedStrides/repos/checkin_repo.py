from sqlalchemy.ext.asyncio import AsyncSession


class CheckinRepo:
    def __init__(self, db: AsyncSession):
        self.db = db
