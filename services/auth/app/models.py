"""Auth Service ORM models and schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class UpworkToken(Base):
    __tablename__ = "upwork_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_type = Column(String(50), default="Bearer")
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class UpworkOAuthConfig(Base):
    """Upwork OAuth credentials managed via UI."""
    __tablename__ = "upwork_oauth_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(String(255), nullable=False, default="")
    client_secret = Column(String(255), nullable=False, default="")
    redirect_uri = Column(String(500), nullable=False, default="http://localhost:8080/api/auth/upwork/callback")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TeamProfile(Base):
    """Team skills and portfolio for AI scoring context."""
    __tablename__ = "team_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False, default="Default Team")
    skills_description = Column(Text, default="ДОБАВИМ ПОЗЖЕ")
    portfolio_description = Column(Text, default="ДОБАВИМ ПОЗЖЕ")
    cover_letter_style = Column(Text, default="ДОБАВИМ ПОЗЖЕ")
    hourly_rate_min = Column(Integer, default=0)
    hourly_rate_max = Column(Integer, default=0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# ── Pydantic Schemas ─────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}


class TeamProfileSchema(BaseModel):
    id: int
    name: str
    skills_description: str
    portfolio_description: str
    cover_letter_style: str
    hourly_rate_min: int
    hourly_rate_max: int

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class TeamProfileUpdate(BaseModel):
    name: Optional[str] = None
    skills_description: Optional[str] = None
    portfolio_description: Optional[str] = None
    cover_letter_style: Optional[str] = None
    hourly_rate_min: Optional[int] = None
    hourly_rate_max: Optional[int] = None


class UpworkOAuthConfigSchema(BaseModel):
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = "http://localhost:8080/api/auth/upwork/callback"
    configured: bool = False

    model_config = {"from_attributes": True}


class UpworkOAuthConfigUpdate(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None
