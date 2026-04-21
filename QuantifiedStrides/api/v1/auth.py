from fastapi import APIRouter, Depends, HTTPException

from deps import get_current_user_id, get_user_repo
from models.auth import (
    LoginSchema, RegisterSchema, TokenSchema,
    UpdateProfileSchema, UserProfileSchema,
)
from repos.user_repo import UserRepo
from services import auth_service as auth_svc

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
async def register(body: RegisterSchema, repo: UserRepo = Depends(get_user_repo)):
    try:
        await auth_svc.register(
            repo,
            name=body.name,
            email=body.email,
            password=body.password,
            goal=body.goal,
            gym_days_week=body.gym_days_week,
            primary_sports=body.primary_sports,
            date_of_birth=body.date_of_birth,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=TokenSchema)
async def login(body: LoginSchema, repo: UserRepo = Depends(get_user_repo)):
    try:
        result = await auth_svc.login(repo, email=body.email, password=body.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return TokenSchema(**result)


@router.get("/verify")
async def verify_email(token: str, repo: UserRepo = Depends(get_user_repo)):
    try:
        result = await auth_svc.verify_email(repo, token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TokenSchema(**result)


@router.get("/me", response_model=UserProfileSchema)
async def get_me(
    user_id: int = Depends(get_current_user_id),
    repo: UserRepo = Depends(get_user_repo),
):
    try:
        return await auth_svc.get_me(repo, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/me", status_code=204)
async def delete_me(
    user_id: int = Depends(get_current_user_id),
    repo: UserRepo = Depends(get_user_repo),
):
    await auth_svc.delete_user(repo, user_id)


@router.put("/me", response_model=UserProfileSchema)
async def update_me(
    body: UpdateProfileSchema,
    user_id: int = Depends(get_current_user_id),
    repo: UserRepo = Depends(get_user_repo),
):
    return await auth_svc.update_me(
        repo, user_id,
        name=body.name,
        goal=body.goal,
        gym_days_week=body.gym_days_week,
        primary_sports=body.primary_sports,
        garmin_email=body.garmin_email,
        garmin_password=body.garmin_password,
    )