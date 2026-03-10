"""Pydantic schemas and SQLAlchemy ORM models for Jobs Service."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase


# ── ORM Base ──────────────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    pass


# ── Enums ─────────────────────────────────────────────────────────────────────


class JobStatus(str, enum.Enum):
    discovered = "discovered"
    scored = "scored"
    letter_ready = "letter_ready"
    under_review = "under_review"
    approved = "approved"
    applied = "applied"
    response = "response"
    hired = "hired"
    rejected = "rejected"


class ContractType(str, enum.Enum):
    hourly = "hourly"
    fixed = "fixed"


class ExperienceLevel(str, enum.Enum):
    entry = "entry"
    intermediate = "intermediate"
    expert = "expert"


# ── ORM Models ───────────────────────────────────────────────────────────────


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    upwork_id = Column(String(64), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    description_ru = Column(Text, nullable=True)
    category = Column(String(200), nullable=True)
    subcategory = Column(String(200), nullable=True)
    contract_type = Column(Enum(ContractType), nullable=True)
    budget_min = Column(Float, nullable=True)
    budget_max = Column(Float, nullable=True)
    hourly_rate_min = Column(Float, nullable=True)
    hourly_rate_max = Column(Float, nullable=True)
    duration = Column(String(100), nullable=True)
    duration_label = Column(String(100), nullable=True)
    engagement = Column(String(100), nullable=True)
    experience_level = Column(Enum(ExperienceLevel), nullable=True)
    skills = Column(ARRAY(String), default=list)
    connect_price = Column(Integer, nullable=True)
    proposals_count = Column(Integer, nullable=True)
    detected_language = Column(String(10), default="en")
    upwork_url = Column(String(500), nullable=True)

    # Client info (denormalized for quick access)
    client_upwork_uid = Column(String(64), nullable=True)
    client_country = Column(String(100), nullable=True)
    client_payment_verified = Column(Boolean, nullable=True)
    client_rating = Column(Float, nullable=True)
    client_total_spent = Column(Float, nullable=True)
    client_hire_rate = Column(Float, nullable=True)
    client_jobs_posted = Column(Integer, nullable=True)
    client_member_since = Column(DateTime, nullable=True)

    # Pipeline
    status = Column(Enum(JobStatus), default=JobStatus.discovered, index=True)
    overall_score = Column(Float, nullable=True)
    score_details = Column(JSONB, nullable=True)

    # Timestamps
    posted_at = Column(DateTime, nullable=True)
    discovered_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class JobScore(Base):
    __tablename__ = "job_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, nullable=False, index=True)
    skill_match = Column(Float, nullable=False)
    budget_fit = Column(Float, nullable=False)
    scope_clarity = Column(Float, nullable=False)
    win_probability = Column(Float, nullable=False)
    client_risk = Column(Float, nullable=False)
    overall_score = Column(Float, nullable=False)
    llm_reasoning = Column(Text, nullable=True)
    scored_at = Column(DateTime, server_default=func.now())


class SearchFilter(Base):
    __tablename__ = "search_filters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    keywords = Column(ARRAY(String), default=list)
    skills = Column(ARRAY(String), default=list)
    category = Column(String(200), nullable=True)
    contract_type = Column(Enum(ContractType), nullable=True)
    experience_level = Column(Enum(ExperienceLevel), nullable=True)
    budget_min = Column(Float, nullable=True)
    budget_max = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


# ── Pydantic Schemas ─────────────────────────────────────────────────────────


class ClientInfoSchema(BaseModel):
    upwork_uid: Optional[str] = None
    country: Optional[str] = None
    payment_verified: Optional[bool] = None
    rating: Optional[float] = None
    total_spent: Optional[float] = None
    hire_rate: Optional[float] = None
    jobs_posted: Optional[int] = None
    member_since: Optional[datetime] = None


class JobCreateSchema(BaseModel):
    upwork_id: str
    title: str
    description: str
    category: Optional[str] = None
    subcategory: Optional[str] = None
    contract_type: Optional[ContractType] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    hourly_rate_min: Optional[float] = None
    hourly_rate_max: Optional[float] = None
    duration: Optional[str] = None
    duration_label: Optional[str] = None
    engagement: Optional[str] = None
    experience_level: Optional[ExperienceLevel] = None
    skills: list[str] = Field(default_factory=list)
    connect_price: Optional[int] = None
    proposals_count: Optional[int] = None
    detected_language: str = "en"
    upwork_url: Optional[str] = None
    client: Optional[ClientInfoSchema] = None
    posted_at: Optional[datetime] = None


class JobResponseSchema(BaseModel):
    id: int
    upwork_id: str
    title: str
    description: str
    description_ru: Optional[str] = None
    category: Optional[str] = None
    contract_type: Optional[ContractType] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    hourly_rate_min: Optional[float] = None
    hourly_rate_max: Optional[float] = None
    duration: Optional[str] = None
    engagement: Optional[str] = None
    experience_level: Optional[ExperienceLevel] = None
    skills: list[str] = []
    connect_price: Optional[int] = None
    proposals_count: Optional[int] = None
    detected_language: str = "en"
    upwork_url: Optional[str] = None
    status: JobStatus
    overall_score: Optional[float] = None
    score_details: Optional[dict] = None

    # Client
    client_country: Optional[str] = None
    client_payment_verified: Optional[bool] = None
    client_rating: Optional[float] = None
    client_total_spent: Optional[float] = None
    client_hire_rate: Optional[float] = None
    client_jobs_posted: Optional[int] = None
    client_member_since: Optional[datetime] = None

    posted_at: Optional[datetime] = None
    discovered_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    total: int
    items: list[JobResponseSchema]


class JobScoreSchema(BaseModel):
    skill_match: float
    budget_fit: float
    scope_clarity: float
    win_probability: float
    client_risk: float
    overall_score: float
    llm_reasoning: Optional[str] = None


class SearchFilterCreate(BaseModel):
    name: str
    keywords: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    category: Optional[str] = None
    contract_type: Optional[ContractType] = None
    experience_level: Optional[ExperienceLevel] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None


class SearchFilterResponse(BaseModel):
    id: int
    name: str
    keywords: list[str]
    skills: list[str]
    category: Optional[str] = None
    contract_type: Optional[ContractType] = None
    experience_level: Optional[ExperienceLevel] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    is_active: bool

    model_config = {"from_attributes": True}


class StatusUpdateSchema(BaseModel):
    status: JobStatus
    notes: Optional[str] = None
