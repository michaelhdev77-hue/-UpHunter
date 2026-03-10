"""Auth Service API routes — login, Upwork OAuth, team profile."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import (
    LoginRequest,
    TeamProfile,
    TeamProfileSchema,
    TeamProfileUpdate,
    TokenResponse,
    UpworkToken,
    User,
    UserResponse,
)

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_jwt(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": str(user_id), "email": email, "exp": expire},
        settings.secret_key,
        algorithm="HS256",
    )


# ── Auth ─────────────────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not pwd_context.verify(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_jwt(user.id, user.email))


@router.get("/me", response_model=UserResponse)
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    # Simple token check — extract from Authorization header
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(auth[7:], settings.secret_key, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)


# ── Upwork OAuth 2.0 ────────────────────────────────────────────────────────


@router.get("/upwork/authorize")
async def upwork_authorize():
    """Redirect to Upwork OAuth consent page."""
    if not settings.upwork_client_id:
        raise HTTPException(
            status_code=503,
            detail="Upwork OAuth not configured — set UPWORK_CLIENT_ID",
        )
    params = urlencode(
        {
            "client_id": settings.upwork_client_id,
            "response_type": "code",
            "redirect_uri": settings.upwork_redirect_uri,
        }
    )
    return RedirectResponse(f"{settings.upwork_auth_url}?{params}")


@router.get("/upwork/callback")
async def upwork_callback(
    code: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Exchange authorization code for access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            settings.upwork_token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.upwork_client_id,
                "client_secret": settings.upwork_client_secret,
                "redirect_uri": settings.upwork_redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Upwork token exchange failed: {resp.text}",
        )

    token_data = resp.json()
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 86400)

    # TODO: associate with actual user (for now, user_id=1)
    user_id = 1

    # Upsert token
    result = await db.execute(
        select(UpworkToken).where(UpworkToken.user_id == user_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.access_token = access_token
        existing.refresh_token = refresh_token
        existing.expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    else:
        db.add(
            UpworkToken(
                user_id=user_id,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
            )
        )
    await db.commit()

    # Redirect to frontend
    return RedirectResponse("http://localhost:3000/settings?upwork=connected")


@router.get("/upwork/token")
async def get_upwork_token(db: AsyncSession = Depends(get_db)):
    """Get current Upwork access token (internal use)."""
    result = await db.execute(
        select(UpworkToken).order_by(UpworkToken.updated_at.desc()).limit(1)
    )
    token = result.scalar_one_or_none()
    if not token:
        return {"access_token": None, "connected": False}
    return {
        "access_token": token.access_token,
        "connected": True,
        "expires_at": token.expires_at.isoformat() if token.expires_at else None,
    }


# ── Team Profile ─────────────────────────────────────────────────────────────


@router.get("/team-profile", response_model=Optional[TeamProfileSchema])
async def get_team_profile(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TeamProfile).limit(1))
    profile = result.scalar_one_or_none()
    if not profile:
        return None
    return TeamProfileSchema.model_validate(profile)


@router.put("/team-profile", response_model=TeamProfileSchema)
async def update_team_profile(
    body: TeamProfileUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TeamProfile).limit(1))
    profile = result.scalar_one_or_none()

    if not profile:
        profile = TeamProfile(name="Default Team")
        db.add(profile)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return TeamProfileSchema.model_validate(profile)
