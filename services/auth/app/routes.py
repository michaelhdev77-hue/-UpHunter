"""Auth Service API routes — login, Upwork OAuth, team profile."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.dependencies import get_current_user
from app.models import (
    LoginRequest,
    TeamProfile,
    TeamProfileSchema,
    TeamProfileUpdate,
    TokenResponse,
    UpworkOAuthConfig,
    UpworkOAuthConfigSchema,
    UpworkOAuthConfigUpdate,
    UpworkToken,
    User,
    UserResponse,
    UserUpdateRequest,
)

router = APIRouter()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


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
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_jwt(user.id, user.email))


@router.post("/register", response_model=TokenResponse)
async def register(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    # Auto-create team profile
    db.add(TeamProfile(user_id=user.id, name="My Team"))
    await db.commit()
    return TokenResponse(access_token=create_jwt(user.id, user.email))


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user profile (name and/or password)."""
    if body.name is not None:
        user.name = body.name

    if body.new_password:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="Current password required")
        if not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        user.hashed_password = hash_password(body.new_password)

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


# ── Upwork OAuth 2.0 ────────────────────────────────────────────────────────


async def _get_upwork_credentials(db: AsyncSession) -> tuple[str, str, str]:
    """Get Upwork OAuth credentials: DB first, then ENV fallback."""
    result = await db.execute(select(UpworkOAuthConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if cfg and cfg.client_id and cfg.client_secret:
        return cfg.client_id, cfg.client_secret, cfg.redirect_uri
    env_id = settings.upwork_client_id
    env_secret = settings.upwork_client_secret
    if env_id and env_id != "CHANGE_ME" and env_secret and env_secret != "CHANGE_ME":
        return env_id, env_secret, settings.upwork_redirect_uri
    return "", "", settings.upwork_redirect_uri


@router.get("/upwork/settings", response_model=UpworkOAuthConfigSchema)
async def get_upwork_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current Upwork OAuth config (client_secret is masked)."""
    result = await db.execute(select(UpworkOAuthConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if cfg and cfg.client_id:
        masked_secret = cfg.client_secret[:4] + "****" if len(cfg.client_secret) > 4 else "****"
        return UpworkOAuthConfigSchema(
            client_id=cfg.client_id,
            client_secret=masked_secret,
            redirect_uri=cfg.redirect_uri,
            configured=True,
        )
    env_id = settings.upwork_client_id
    env_secret = settings.upwork_client_secret
    if env_id and env_id not in ("", "CHANGE_ME"):
        return UpworkOAuthConfigSchema(
            client_id=env_id,
            client_secret="****" if env_secret and env_secret != "CHANGE_ME" else "",
            redirect_uri=settings.upwork_redirect_uri,
            configured=bool(env_secret and env_secret != "CHANGE_ME"),
        )
    return UpworkOAuthConfigSchema()


@router.put("/upwork/settings", response_model=UpworkOAuthConfigSchema)
async def update_upwork_settings(
    body: UpworkOAuthConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save Upwork OAuth credentials to DB."""
    result = await db.execute(select(UpworkOAuthConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = UpworkOAuthConfig()
        db.add(cfg)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    await db.commit()
    await db.refresh(cfg)
    masked_secret = cfg.client_secret[:4] + "****" if len(cfg.client_secret) > 4 else "****"
    return UpworkOAuthConfigSchema(
        client_id=cfg.client_id,
        client_secret=masked_secret,
        redirect_uri=cfg.redirect_uri,
        configured=bool(cfg.client_id and cfg.client_secret),
    )


@router.get("/upwork/authorize")
async def upwork_authorize(
    token: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    """Redirect to Upwork OAuth consent page."""
    # Auth via query param (browser redirect can't send Authorization header)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    client_id, client_secret, redirect_uri = await _get_upwork_credentials(db)
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Upwork OAuth not configured — добавьте Client ID и Client Secret в настройках",
        )
    params = urlencode(
        {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "state": str(user_id),
        }
    )
    return RedirectResponse(f"{settings.upwork_auth_url}?{params}")


@router.get("/upwork/callback")
async def upwork_callback(
    code: str = Query(...),
    state: str = Query(default="1"),
    db: AsyncSession = Depends(get_db),
):
    """Exchange authorization code for access token."""
    client_id, client_secret, redirect_uri = await _get_upwork_credentials(db)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            settings.upwork_token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
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

    # user_id from OAuth state parameter
    try:
        user_id = int(state)
    except (ValueError, TypeError):
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
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3002")
    return RedirectResponse(f"{frontend_url}/settings?upwork=connected")


@router.get("/upwork/token")
async def get_upwork_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get current Upwork access token.

    If called with a valid JWT — returns token for that user.
    If called without auth (inter-service) — returns latest token.
    """
    user_id = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(auth[7:], settings.secret_key, algorithms=["HS256"])
            user_id = int(payload["sub"])
        except Exception:
            pass

    if user_id:
        result = await db.execute(
            select(UpworkToken).where(UpworkToken.user_id == user_id).limit(1)
        )
    else:
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
async def get_team_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get team profile. Authenticated = user's profile. No auth = latest profile (inter-service)."""
    user_id = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(auth[7:], settings.secret_key, algorithms=["HS256"])
            user_id = int(payload["sub"])
        except Exception:
            pass

    if user_id:
        result = await db.execute(
            select(TeamProfile).where(TeamProfile.user_id == user_id).limit(1)
        )
    else:
        # Inter-service call: return latest profile
        result = await db.execute(
            select(TeamProfile).order_by(TeamProfile.id.desc()).limit(1)
        )
    profile = result.scalar_one_or_none()
    if not profile:
        return None
    return TeamProfileSchema.model_validate(profile)


@router.put("/team-profile", response_model=TeamProfileSchema)
async def update_team_profile(
    body: TeamProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TeamProfile).where(TeamProfile.user_id == user.id).limit(1)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        profile = TeamProfile(user_id=user.id, name="Default Team")
        db.add(profile)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return TeamProfileSchema.model_validate(profile)
