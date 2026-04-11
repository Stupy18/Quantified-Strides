import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class UserRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def email_exists(self, email: str) -> bool:
        result = await self.db.execute(
            text("SELECT 1 FROM users WHERE email = :email"),
            {"email": email},
        )
        return result.fetchone() is not None

    async def get_by_email(self, email: str):
        result = await self.db.execute(
            text("SELECT user_id, name, password_hash, email_verified FROM users WHERE email = :email"),
            {"email": email},
        )
        return result.fetchone()

    async def get_by_id(self, user_id: int):
        result = await self.db.execute(
            text("""
                SELECT u.user_id, u.name, u.email,
                       p.goal, p.gym_days_week, p.primary_sports,
                       p.garmin_email, p.garmin_password
                FROM users u
                LEFT JOIN user_profile p USING (user_id)
                WHERE u.user_id = :uid
            """),
            {"uid": user_id},
        )
        return result.fetchone()

    async def get_by_verification_token(self, token: str):
        result = await self.db.execute(
            text("""
                SELECT user_id, name, email FROM users
                WHERE verification_token = :token AND email_verified = FALSE
            """),
            {"token": token},
        )
        return result.fetchone()

    async def insert_user(self, name: str, email: str, password_hash: str, verification_token: str) -> int:
        result = await self.db.execute(
            text("""
                INSERT INTO users (name, email, password_hash, email_verified, verification_token)
                VALUES (:name, :email, :hash, FALSE, :token)
                RETURNING user_id
            """),
            {"name": name, "email": email, "hash": password_hash, "token": verification_token},
        )
        return result.scalar_one()

    async def insert_profile(self, user_id: int, goal: str, gym_days_week: int, primary_sports: dict) -> None:
        await self.db.execute(
            text("""
                INSERT INTO user_profile (user_id, goal, gym_days_week, primary_sports)
                VALUES (:uid, :goal, :gym, CAST(:sports AS jsonb))
            """),
            {"uid": user_id, "goal": goal, "gym": gym_days_week, "sports": json.dumps(primary_sports)},
        )

    async def mark_email_verified(self, user_id: int) -> None:
        await self.db.execute(
            text("UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE user_id = :uid"),
            {"uid": user_id},
        )

    async def update_name(self, user_id: int, name: str) -> None:
        await self.db.execute(
            text("UPDATE users SET name = :name WHERE user_id = :uid"),
            {"name": name, "uid": user_id},
        )

    async def update_profile(self, user_id: int, fields: dict) -> None:
        set_clause = ", ".join(f"{k} = :{k}" for k in fields)
        await self.db.execute(
            text(f"UPDATE user_profile SET {set_clause} WHERE user_id = :uid"),
            {**fields, "uid": user_id},
        )

    async def update_sports(self, user_id: int, primary_sports: dict) -> None:
        await self.db.execute(
            text("UPDATE user_profile SET primary_sports = CAST(:v AS jsonb) WHERE user_id = :uid"),
            {"v": json.dumps(primary_sports), "uid": user_id},
        )

    async def delete(self, user_id: int) -> None:
        await self.db.execute(
            text("DELETE FROM users WHERE user_id = :uid"),
            {"uid": user_id},
        )

    async def get_garmin_creds(self, user_id: int) -> dict:
        result = await self.db.execute(
            text("SELECT garmin_email, garmin_password FROM user_profile WHERE user_id = :uid"),
            {"uid": user_id},
        )
        row = result.fetchone()
        if row and row.garmin_email and row.garmin_password:
            return {"GARMIN_EMAIL": row.garmin_email, "GARMIN_PASSWORD": row.garmin_password}
        return {}
