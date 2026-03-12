"""SQLAlchemy ORM models for AI Scoring Service."""
from __future__ import annotations

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class JobScore(Base):
    __tablename__ = "job_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, unique=True, nullable=False, index=True)
    skill_match = Column(Float)
    budget_fit = Column(Float)
    scope_clarity = Column(Float)
    win_probability = Column(Float)
    client_risk = Column(Float)
    overall_score = Column(Float)
    llm_reasoning = Column(Text)
    scored_at = Column(DateTime, server_default=func.now())


class ScoringConfig(Base):
    __tablename__ = "scoring_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    openai_model = Column(String(100), nullable=False, default="gpt-4o")
    openai_temperature = Column(Float, nullable=False, default=0.3)
    weight_skill_match = Column(Float, nullable=False, default=0.35)
    weight_budget_fit = Column(Float, nullable=False, default=0.20)
    weight_scope_clarity = Column(Float, nullable=False, default=0.15)
    weight_win_probability = Column(Float, nullable=False, default=0.30)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
