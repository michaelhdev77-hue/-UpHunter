"""Letter Generation Service API routes."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from sqlalchemy import func as sa_func

from app.db import get_db
from app.generator import detect_language, generate_cover_letter, get_letter_config, translate_to_russian
from app.models import CoverLetter, CoverLetterResponse, GenerateRequest, LetterConfig, LetterStatus, RegenerateRequest

logger = logging.getLogger(__name__)

router = APIRouter()


class LetterUpdateRequest(BaseModel):
    content_original: Optional[str] = None
    content_ru: Optional[str] = None
    edited_by: Optional[str] = None


class LetterConfigSchema(BaseModel):
    openai_model: str = "gpt-4o"
    temperature_generation: float = 0.7
    temperature_translation: float = 0.3
    max_words: int = 300
    model_config = ConfigDict(from_attributes=True)


class LetterConfigUpdate(BaseModel):
    openai_model: Optional[str] = None
    temperature_generation: Optional[float] = None
    temperature_translation: Optional[float] = None
    max_words: Optional[int] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _fetch_job(job_id: int) -> dict:
    """Fetch job details from the Jobs Service."""
    url = f"{settings.jobs_service_url}/{job_id}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found in Jobs Service")
    if resp.status_code != 200:
        logger.error("Jobs Service returned %s for job %s: %s", resp.status_code, job_id, resp.text)
        raise HTTPException(status_code=502, detail="Failed to fetch job from Jobs Service")
    return resp.json()


async def _fetch_team_profile() -> dict:
    """Fetch team profile from the Auth Service."""
    url = f"{settings.auth_service_url}/team-profile"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        logger.error("Auth Service returned %s: %s", resp.status_code, resp.text)
        raise HTTPException(status_code=502, detail="Failed to fetch team profile from Auth Service")
    return resp.json()


async def _update_job_status(job_id: int, status: str) -> None:
    """Update the job status in the Jobs Service via PATCH."""
    url = f"{settings.jobs_service_url}/{job_id}/status"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(url, json={"status": status})
    if resp.status_code not in (200, 204):
        logger.warning("Failed to update job %s status to '%s': %s %s", job_id, status, resp.status_code, resp.text)


async def _get_approved_examples(db: AsyncSession, limit: int = 3) -> list[str]:
    """Fetch recently approved cover letters as few-shot examples for auto-learning."""
    result = await db.execute(
        select(CoverLetter.content_original)
        .where(CoverLetter.status == LetterStatus.approved)
        .order_by(CoverLetter.approved_at.desc())
        .limit(limit)
    )
    return [row[0] for row in result.all() if row[0]]


# ---------------------------------------------------------------------------
# Endpoints — static paths MUST come before /{param} to avoid shadowing
# ---------------------------------------------------------------------------


class TranslateRequest(BaseModel):
    text: str


@router.post("/translate")
async def translate_text(body: TranslateRequest, db: AsyncSession = Depends(get_db)):
    """Translate arbitrary text to Russian using the configured OpenAI model."""
    config = await get_letter_config(db)
    try:
        translated = await translate_to_russian(body.text, config=config)
    except Exception as exc:
        logger.exception("Translation failed")
        raise HTTPException(status_code=502, detail=f"Translation failed: {exc}")
    return {"translated": translated}


@router.get("/settings")
async def get_letter_settings(db: AsyncSession = Depends(get_db)):
    """Get current letter generation settings."""
    result = await db.execute(select(LetterConfig).where(LetterConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        return LetterConfigSchema()
    return LetterConfigSchema.model_validate(config)


@router.put("/settings")
async def update_letter_settings(body: LetterConfigUpdate, db: AsyncSession = Depends(get_db)):
    """Update letter generation settings."""
    result = await db.execute(select(LetterConfig).where(LetterConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        config = LetterConfig(id=1)
        db.add(config)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return LetterConfigSchema.model_validate(config)


@router.get("/stats/styles")
async def style_stats(db: AsyncSession = Depends(get_db)):
    """A/B testing stats: approval rates by cover letter style."""
    result = await db.execute(
        select(
            CoverLetter.style,
            CoverLetter.status,
            sa_func.count(CoverLetter.id),
        )
        .group_by(CoverLetter.style, CoverLetter.status)
    )
    rows = result.all()

    # Pivot: style -> {total, approved, rejected, draft, approval_rate}
    stats: dict[str, dict] = {}
    for style, status, count in rows:
        style_name = style or "professional"
        if style_name not in stats:
            stats[style_name] = {"total": 0, "approved": 0, "rejected": 0, "draft": 0}
        stats[style_name]["total"] += count
        stats[style_name][status.value if hasattr(status, 'value') else status] += count

    for style_name, data in stats.items():
        decided = data["approved"] + data["rejected"]
        data["approval_rate"] = round(data["approved"] / decided * 100, 1) if decided > 0 else None

    return stats


@router.post("/generate", response_model=CoverLetterResponse)
async def generate_cover_letter_endpoint(
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate a cover letter for a job.

    1. Fetch job details from Jobs Service
    2. Fetch team profile from Auth Service
    3. Detect language of job description
    4. Generate cover letter via OpenAI
    5. Translate job description to Russian (description_ru hint)
    6. Translate cover letter to Russian
    7. Save to DB
    8. Update job status to "letter_ready"
    """
    # 1 & 2 — fetch external data
    job = await _fetch_job(body.job_id)
    team_profile = await _fetch_team_profile()

    # 3 — detect language
    description = job.get("description", "")
    language = detect_language(description)

    # 3.5 — fetch approved letters as few-shot examples (auto-learn)
    approved_examples = await _get_approved_examples(db, limit=3)

    # 3.6 — determine style (A/B testing)
    style = body.style or "professional"

    # 3.7 — load runtime config from DB
    letter_config = await get_letter_config(db)

    # 4 — generate cover letter
    try:
        content_original = await generate_cover_letter(
            job=job,
            team_profile=team_profile,
            language=language,
            style=style,
            approved_examples=approved_examples,
            config=letter_config,
        )
    except Exception as exc:
        logger.exception("Cover letter generation failed for job %s", body.job_id)
        raise HTTPException(status_code=502, detail=f"Ошибка генерации письма (OpenAI): {exc}")

    # 5 — translate job description to Russian (informational hint, logged)
    try:
        description_ru = await translate_to_russian(description, config=letter_config)
        logger.info("Job %s description translated to Russian (%d chars)", body.job_id, len(description_ru))
    except Exception:
        logger.exception("Failed to translate job description for job %s", body.job_id)
        description_ru = None

    # 6 — translate cover letter to Russian
    try:
        content_ru = await translate_to_russian(content_original, config=letter_config)
    except Exception:
        logger.exception("Failed to translate cover letter for job %s", body.job_id)
        content_ru = None

    # 7 — persist
    letter = CoverLetter(
        job_id=body.job_id,
        content_original=content_original,
        content_ru=content_ru,
        language=language,
        version=1,
        status=LetterStatus.draft,
        style=style,
    )
    db.add(letter)
    await db.commit()
    await db.refresh(letter)

    # 8 — notify Jobs Service
    await _update_job_status(body.job_id, "letter_ready")

    # 9 — publish Kafka event
    from app.kafka_producer import publish_event
    await publish_event("letter.generated", {
        "job_id": body.job_id,
        "letter_id": letter.id,
        "language": language,
        "version": 1,
    })

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

    Same flow as /generate but:
    - Uses the existing letter's job_id
    - Appends optional ``instructions`` to the prompt
    """
    result = await db.execute(select(CoverLetter).where(CoverLetter.id == letter_id))
    old_letter = result.scalar_one_or_none()
    if not old_letter:
        raise HTTPException(status_code=404, detail="Cover letter not found")

    # Fetch external data
    job = await _fetch_job(old_letter.job_id)
    team_profile = await _fetch_team_profile()

    description = job.get("description", "")
    language = detect_language(description)

    # Fetch approved examples + determine style
    approved_examples = await _get_approved_examples(db, limit=3)
    style = body.style or old_letter.style or "professional"

    # Load runtime config from DB
    letter_config = await get_letter_config(db)

    # Generate with optional extra instructions
    try:
        content_original = await generate_cover_letter(
            job=job,
            team_profile=team_profile,
            language=language,
            style=style,
            extra_instructions=body.instructions,
            approved_examples=approved_examples,
            config=letter_config,
        )
    except Exception as exc:
        logger.exception("Cover letter regeneration failed for letter %s", letter_id)
        raise HTTPException(status_code=502, detail=f"Ошибка генерации письма (OpenAI): {exc}")

    # Translate to Russian
    try:
        content_ru = await translate_to_russian(content_original, config=letter_config)
    except Exception:
        logger.exception("Failed to translate regenerated letter %s", letter_id)
        content_ru = None

    new_letter = CoverLetter(
        job_id=old_letter.job_id,
        content_original=content_original,
        content_ru=content_ru,
        language=language,
        version=old_letter.version + 1,
        status=LetterStatus.draft,
        style=style,
    )
    db.add(new_letter)
    await db.commit()
    await db.refresh(new_letter)

    # Update job status again
    await _update_job_status(old_letter.job_id, "letter_ready")

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
