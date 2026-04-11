from sqlalchemy.ext.asyncio import AsyncSession


class EnvironmentRepo:
    def __init__(self, db: AsyncSession):
        self.db = db
