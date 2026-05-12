import json
from datetime import timedelta
from functools import wraps

from pydantic import BaseModel

from core.logger import logger

rd = None


async def _to_dict(obj):
    res = {}
    for key, value in obj:
        if isinstance(value, list) and value and isinstance(value[0], BaseModel):
            res[key] = [await _to_dict(item) for item in value]
        elif isinstance(value, BaseModel):
            res[key] = await _to_dict(value)
        else:
            res[key] = value
    return res


def _build_key(*args, **kwargs) -> str:
    parts = [a for a in args if isinstance(a, str)]
    parts += [v for v in kwargs.values() if isinstance(v, str)]
    return "_".join(parts)


def async_redis(cache_duration: timedelta, suffix: str = None, ignore_cache: bool = False, custom_key: bool = False):
    def decorator(function):
        @wraps(function)
        async def wrapper(*args, **kwargs):
            key = str(args[0]) if custom_key and args else _build_key(*args, **kwargs)
            if suffix:
                key += suffix

            if not ignore_cache:
                try:
                    cached = await rd.get(key)
                    if cached is not None:
                        result = json.loads(cached)
                        if result:
                            logger.info("Cache hit: %s", key)
                            return result
                except Exception as e:
                    logger.warning("Redis get error for key %s: %s", key, e)

            result = await function(*args, **kwargs)

            if result is None or isinstance(result, bool) or (hasattr(result, "__len__") and len(result) == 0):
                return result

            try:
                payload = await _to_dict(result) if isinstance(result, BaseModel) else result
                await rd.setex(key, int(cache_duration.total_seconds()), json.dumps(payload))
                logger.info("Cache set: %s", key)
            except Exception as e:
                logger.warning("Redis set error for key %s: %s", key, e)

            return result

        return wrapper

    return decorator


async def delete(key: str, suffix: str = "") -> None:
    key = key + suffix
    try:
        if await rd.exists(key):
            await rd.delete(key)
            logger.info("Cache deleted: %s", key)
    except Exception as e:
        logger.warning("Redis delete error for key %s: %s", key, e)