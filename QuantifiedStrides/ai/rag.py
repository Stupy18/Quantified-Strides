"""
RAG retrieval service.

Embeds a query using the same model as ingest_knowledge.py,
runs cosine similarity search against knowledge_chunks,
returns the top-k most relevant text chunks.
"""

from functools import lru_cache

from fastembed import TextEmbedding

from repos.knowledge_repo import KnowledgeRepo

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
TOP_K      = 4   # chunks injected into Claude's context


@lru_cache(maxsize=1)
def _get_model() -> TextEmbedding:
    """Load once, reuse across requests."""
    return TextEmbedding(MODEL_NAME)


async def retrieve(query: str, repo: KnowledgeRepo, k: int = TOP_K) -> list[dict]:
    """
    Embed `query` and return the k most similar knowledge chunks.

    Returns a list of dicts: {source_title, content, similarity}
    """
    embedding = next(_get_model().embed([query])).tolist()
    rows = await repo.similarity_search(embedding, k)
    return [
        {"source_title": row.source_title, "content": row.content, "similarity": float(row.similarity)}
        for row in rows
    ]