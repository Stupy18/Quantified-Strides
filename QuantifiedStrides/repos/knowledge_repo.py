from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class KnowledgeRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def similarity_search(self, embedding: list[float], k: int) -> list:
        result = await self.db.execute(
            text("""
                SELECT source_title, content,
                       1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM   knowledge_chunks
                ORDER  BY embedding <=> CAST(:embedding AS vector)
                LIMIT  :k
            """),
            {"embedding": str(embedding), "k": k},
        )
        return result.fetchall()