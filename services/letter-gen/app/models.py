"""Pydantic schemas and SQLAlchemy ORM models for Letter Generation Service."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Enum, Integer, String, Text, func
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
    edited_by = Column(String(200), nullable=True)
    generated_at = Column(DateTime, server_default=func.now())
    approved_at = Column(DateTime, nullable=True)


# -- Pydantic Schemas ---------------------------------------------------------


class CoverLetterResponse(BaseModel):
    id: int
    job_id: int
    content_original: str
    content_ru: Optional[str] = None
    language: str = "en"
    version: int = 1
    status: LetterStatus = LetterStatus.draft
    edited_by: Optional[str] = None
    generated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GenerateRequest(BaseModel):
    job_id: int


class RegenerateRequest(BaseModel):
    instructions: Optional[str] = None
