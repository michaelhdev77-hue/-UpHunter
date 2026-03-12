"""Pydantic schemas and SQLAlchemy ORM models for Letter Generation Service."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Enum, Float, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase


# -- ORM Base -----------------------------------------------------------------


class Base(DeclarativeBase):
    pass


# -- Enums ---------------------------------------------------------------------


class LetterStatus(str, enum.Enum):
    draft = "draft"
    approved = "approved"
    rejected = "rejected"


# -- ORM Models ---------------------------------------------------------------


class CoverLetter(Base):
    __tablename__ = "cover_letters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, nullable=False, index=True)
    content_original = Column(Text, nullable=False)
    content_ru = Column(Text, nullable=True)
    language = Column(String(10), default="en")
    version = Column(Integer, default=1)
    status = Column(Enum(LetterStatus), default=LetterStatus.draft)
    style = Column(String(30), default="professional")  # A/B: professional, casual, technical
    edited_by = Column(String(200), nullable=True)
    generated_at = Column(DateTime, server_default=func.now())
    approved_at = Column(DateTime, nullable=True)


class LetterConfig(Base):
    __tablename__ = "letter_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    openai_model = Column(String(100), nullable=False, default="gpt-4o")
    temperature_generation = Column(Float, nullable=False, default=0.7)
    temperature_translation = Column(Float, nullable=False, default=0.3)
    max_words = Column(Integer, nullable=False, default=300)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# -- Pydantic Schemas ---------------------------------------------------------


class CoverLetterResponse(BaseModel):
    id: int
    job_id: int
    content_original: str
    content_ru: Optional[str] = None
    language: str = "en"
    version: int = 1
    status: LetterStatus = LetterStatus.draft
    style: str = "professional"
    edited_by: Optional[str] = None
    generated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GenerateRequest(BaseModel):
    job_id: int
    style: Optional[str] = None  # professional, casual, technical (A/B testing)


class RegenerateRequest(BaseModel):
    instructions: Optional[str] = None
    style: Optional[str] = None
