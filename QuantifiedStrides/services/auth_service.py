"""
Auth service — register, login, profile get/update.
"""

import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from core.settings import settings
from repos.user_repo import UserRepo

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> int:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    return int(payload["sub"])


# ── register ──────────────────────────────────────────────────────────────────

async def register(
    repo: UserRepo,
    name: str,
    email: str,
    password: str,
    goal: str,
    gym_days_week: int,
    primary_sports: dict,
    date_of_birth=None,
    gender: str | None = None,
    profile_pic_url: str | None = None,
) -> dict:
    if await repo.email_exists(email):
        raise ValueError("Email already registered")

    verification_token = secrets.token_urlsafe(32)
    user_id = await repo.insert_user(name, email, hash_password(password), verification_token, date_of_birth, gender, profile_pic_url)
    await repo.insert_profile(user_id, goal, gym_days_week, primary_sports)
    await repo.db.commit()

    return {"user_id": user_id, "name": name, "email": email, "verification_token": verification_token}


# ── login ─────────────────────────────────────────────────────────────────────

async def login(repo: UserRepo, email: str, password: str) -> dict:
    row = await repo.get_by_email(email)

    if not row or not verify_password(password, row.password_hash):
        raise ValueError("Invalid email or password")
    if not row.email_verified:
        raise ValueError("Please verify your email before signing in")

    token = create_token(row.user_id)
    return {"access_token": token, "token_type": "bearer", "user_id": row.user_id, "name": row.name}


# ── email verification ────────────────────────────────────────────────────────

async def verify_email(repo: UserRepo, token: str) -> dict:
    row = await repo.get_by_verification_token(token)

    if not row:
        raise ValueError("Invalid or already used verification link")

    await repo.mark_email_verified(row.user_id)
    await repo.db.commit()

    jwt_token = create_token(row.user_id)
    return {"access_token": jwt_token, "token_type": "bearer", "user_id": row.user_id, "name": row.name}


# ── me (get + update) ─────────────────────────────────────────────────────────

async def get_me(repo: UserRepo, user_id: int) -> dict:
    row = await repo.get_by_id(user_id)

    if not row:
        raise ValueError("User not found")

    return {
        "user_id":         row.user_id,
        "name":            row.name,
        "email":           row.email,
        "date_of_birth":   row.date_of_birth,
        "gender":          row.gender,
        "profile_pic_url": row.profile_pic_url,
        "goal":            row.goal,
        "gym_days_week":   row.gym_days_week,
        "primary_sports":  row.primary_sports or {},
        "garmin_email":    row.garmin_email,
        "garmin_password": row.garmin_password,
    }


async def delete_user(repo: UserRepo, user_id: int) -> None:
    await repo.delete(user_id)
    await repo.db.commit()


async def update_me(
    repo: UserRepo,
    user_id: int,
    name: str | None,
    goal: str | None,
    gym_days_week: int | None,
    primary_sports: dict | None,
    garmin_email: str | None,
    garmin_password: str | None,
    gender: str | None = None,
    profile_pic_url: str | None = None,
) -> dict:
    if name is not None:
        await repo.update_name(user_id, name)

    if gender is not None:
        await repo.update_gender(user_id, gender)

    if profile_pic_url is not None:
        await repo.update_profile_pic(user_id, profile_pic_url)

    scalar_fields = {k: v for k, v in [
        ("goal", goal),
        ("gym_days_week", gym_days_week),
        ("garmin_email", garmin_email),
        ("garmin_password", garmin_password),
    ] if v is not None}

    if scalar_fields:
        await repo.update_profile(user_id, scalar_fields)

    if primary_sports is not None:
        await repo.update_sports(user_id, primary_sports)

    await repo.db.commit()
    return await get_me(repo, user_id)