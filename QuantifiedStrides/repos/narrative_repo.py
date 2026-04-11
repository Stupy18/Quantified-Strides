from sqlalchemy.ext.asyncio import AsyncSession


class NarrativeRepo:
    def __init__(self, db: AsyncSession):
        self.db = db
