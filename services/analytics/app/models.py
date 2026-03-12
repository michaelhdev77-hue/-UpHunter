"""Pydantic schemas and SQLAlchemy ORM models for Analytics Service."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


# -- ORM Base -----------------------------------------------------------------


class Base(DeclarativeBase):
    pass


# -- ORM Models ---------------------------------------------------------------


class FunnelEvent(Base):
    __tablename__ = "funnel_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    stage = Column(String(100), nullable=False, index=True)
    timestamp = Column(DateTime, server_default=func.now())
    metadata_ = Column("metadata", JSONB, nullable=True)


# -- Pydantic Schemas ---------------------------------------------------------


class FunnelEventCreate(BaseModel):
    job_id: int
    stage: str
    metadata: Optional[dict] = None


class TelegramConfig(Base):
    __tablename__ = "telegram_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bot_token = Column(String(500), nullable=False, default="")
    chat_id = Column(String(100), nullable=False, default="")
    enabled = Column(Boolean, nullable=False, default=False)
    score_threshold = Column(Integer, nullable=False, default=70)
    frontend_url = Column(String(500), nullable=False, default="http://localhost:3002")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class FunnelStageCount(BaseModel):
    stage: str
    count: int


class FunnelStats(BaseModel):
    stages: list[FunnelStageCount]
    total_events: int
