"""Letter Generation Service API routes."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import CoverLetter, CoverLetterResponse, GenerateRequest, LetterStatus, RegenerateRequest

router = APIRouter()


class LetterUpdateRequest(BaseModel):
    content_original: Optional[str] = None
    content_ru: Optional[str] = None
    edited_by: Optional[str] = None


@router.post("/generate", response_model=CoverLetterResponse)
async def generate_cover_letter(body: GenerateRequest, db: AsyncSession = Depends(get_db)):
    """Generate a cover letter for a job.

    TODO: Integrate with OpenAI API to generate actual cover letters.
    - Fetch job details from Jobs Service
    - Fetch team profile from Auth Service
    - Generate cover letter using LLM
    - Translate to Russian
    """
    # TODO: Fetch job from Jobs Service via HTTP
    # TODO: Call OpenAI API with job description and team profile
    # TODO: Generate Russian translation

    letter = CoverLetter(
        job_id=body.job_id,
        content_original="[Mock cover letter] This is a placeholder. OpenAI integration pending.",
        content_ru="[Mock] Это заглушка. Интеграция с OpenAI в процессе.",
        language="en",
        version=1,
        status=LetterStatus.draft,
    )
    db.add(letter)
    await db.commit()
    await db.refresh(letter)
    return CoverLetterResponse.model_validate(letter)


@router.get("/{job_id}", response_model=CoverLetterResponse)
async def get_cover_letter(job_id: int, db: AsyncSession = Depends(get_db)):
    """Get the latest cover letter for a job."""
    result = await db.execute(
        select(CoverLetter)
        .where(CoverLetter.job_id == job_id)
        .order_by(CoverLetter.version.desc())
        .limit(1)
    )
    letter = result.scalar_one_or_none()
    if not letter:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    return CoverLetterResponse.model_validate(letter)


@router.put("/{letter_id}", response_model=CoverLetterResponse)
async def update_cover_letter(
    letter_id: int,
    body: LetterUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update/edit a cover letter."""
    result = await db.execute(select(CoverLetter).where(CoverLetter.id == letter_id))
    letter = result.scalar_one_or_none()
    if not letter:
        raise HTTPException(status_code=404, detail="Cover letter not found")

    if body.content_original is not None:
        letter.content_original = body.content_original
    if body.content_ru is not None:
        letter.content_ru = body.content_ru
    if body.edited_by is not None:
        letter.edited_by = body.edited_by

    await db.commit()
    await db.refresh(letter)
    return CoverLetterResponse.model_validate(letter)


@router.post("/{letter_id}/regenerate", response_model=CoverLetterResponse)
async def regenerate_cover_letter(
    letter_id: int,
    body: RegenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Regenerate a cover letter (creates a new version).

    TODO: Call OpenAI API with optional instructions for regeneration.
    """
    result = await db.execute(select(CoverLetter).where(CoverLetter.id == letter_id))
    old_letter = result.scalar_one_or_none()
    if not old_letter:
        raise HTTPException(status_code=404, detail="Cover letter not found")

    # TODO: Call OpenAI API to regenerate

    new_letter = CoverLetter(
        job_id=old_letter.job_id,
        content_original="[Mock regenerated] Placeholder cover letter.",
        content_ru="[Mock] Перегенерированное сопроводительное письмо.",
        language=old_letter.language,
        version=old_letter.version + 1,
        status=LetterStatus.draft,
    )
    db.add(new_letter)
    await db.commit()
    await db.refresh(new_letter)
    return CoverLetterResponse.model_validate(new_letter)


@router.patch("/{letter_id}/approve", response_model=CoverLetterResponse)
async def approve_cover_letter(letter_id: int, db: AsyncSession = Depends(get_db)):
    """Approve a cover letter."""
    result = await db.execute(select(CoverLetter).where(CoverLetter.id == letter_id))
    letter = result.scalar_one_or_none()
    if not letter:
        raise HTTPException(status_code=404, detail="Cover letter not found")

    letter.status = LetterStatus.approved
    letter.approved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(letter)
    return CoverLetterResponse.model_validate(letter)


@router.patch("/{letter_id}/reject", response_model=CoverLetterResponse)
async def reject_cover_letter(letter_id: int, db: AsyncSession = Depends(get_db)):
    """Reject a cover letter."""
    result = await db.execute(select(CoverLetter).where(CoverLetter.id == letter_id))
    letter = result.scalar_one_or_none()
    if not letter:
        raise HTTPException(status_code=404, detail="Cover letter not found")

    letter.status = LetterStatus.rejected
    await db.commit()
    await db.refresh(letter)
    return CoverLetterResponse.model_validate(letter)
