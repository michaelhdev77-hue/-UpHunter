"""Pydantic schemas and SQLAlchemy ORM models for Client Intelligence Service."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String, Boolean, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase


# -- ORM Base -----------------------------------------------------------------


class Base(DeclarativeBase):
    pass


# -- ORM Models ---------------------------------------------------------------


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    upwork_uid = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=True)
    company = Column(String(300), nullable=True)
    country = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    member_since = Column(DateTime, nullable=True)
    payment_verified = Column(Boolean, default=False)
    total_spent = Column(Float, default=0.0)
    hire_rate = Column(Float, nullable=True)
    jobs_posted = Column(Integer, default=0)
    active_hires = Column(Integer, default=0)
    rating = Column(Float, nullable=True)
    reviews_count = Column(Integer, default=0)
    avg_hourly_rate = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)
    red_flags = Column(ARRAY(String), default=list)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# -- Pydantic Schemas ---------------------------------------------------------


class ClientResponse(BaseModel):
    id: int
    upwork_uid: str
    name: Optional[str] = None
    company: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    member_since: Optional[datetime] = None
    payment_verified: bool = False
    total_spent: float = 0.0
    hire_rate: Optional[float] = None
    jobs_posted: int = 0
    active_hires: int = 0
    rating: Optional[float] = None
    reviews_count: int = 0
    avg_hourly_rate: Optional[float] = None
    risk_score: Optional[float] = None
    red_flags: list[str] = []
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ClientListResponse(BaseModel):
    items: list[ClientResponse]
    total: int


class RiskConfig(Base):
    """Configurable risk scoring weights and red-flag thresholds (singleton id=1)."""
    __tablename__ = "risk_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Scoring weights (must sum to 1.0)
    weight_payment_verified = Column(Float, nullable=False, default=0.25)
    weight_total_spent = Column(Float, nullable=False, default=0.20)
    weight_hire_rate = Column(Float, nullable=False, default=0.15)
    weight_rating = Column(Float, nullable=False, default=0.15)
    weight_reviews = Column(Float, nullable=False, default=0.10)
    weight_account_age = Column(Float, nullable=False, default=0.10)
    weight_location = Column(Float, nullable=False, default=0.05)
    # Red-flag thresholds
    flag_hire_rate_below = Column(Float, nullable=False, default=20.0)
    flag_rating_below = Column(Float, nullable=False, default=3.0)
    flag_account_age_days = Column(Integer, nullable=False, default=30)
    flag_no_reviews_min_jobs = Column(Integer, nullable=False, default=10)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ClientRiskScore(BaseModel):
    upwork_uid: str
    risk_score: float
    red_flags: list[str] = []
    payment_verified: bool = False
    total_spent: float = 0.0
    hire_rate: Optional[float] = None
    rating: Optional[float] = None

    model_config = {"from_attributes": True}
