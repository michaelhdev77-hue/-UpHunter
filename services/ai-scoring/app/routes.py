"""AI Scoring Service API routes."""
from __future__ import annotations

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import JobScore, ScoringConfig
from app.scorer import get_scoring_config, score_job

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic schemas ────────────────────────────────────────────────────────


class ScoreResponse(BaseModel):
    job_id: int
    skill_match: float
    budget_fit: float
    scope_clarity: float
    win_probability: float
    client_risk: float
    overall_score: float
    llm_reasoning: str

    model_config = {"from_attributes": True}


class ScoreAllResponse(BaseModel):
    scored: int
    failed: int
    job_ids: list[int]


class ScoringConfigSchema(BaseModel):
    openai_model: str = "gpt-4o"
    openai_temperature: float = 0.3
    weight_skill_match: float = 0.35
    weight_budget_fit: float = 0.20
    weight_scope_clarity: float = 0.15
    weight_win_probability: float = 0.30
    model_config = ConfigDict(from_attributes=True)


class ScoringConfigUpdate(BaseModel):
    openai_model: str | None = None
    openai_temperature: float | None = None
    weight_skill_match: float | None = None
    weight_budget_fit: float | None = None
    weight_scope_clarity: float | None = None
    weight_win_probability: float | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _fetch_job(client: httpx.AsyncClient, job_id: int) -> dict:
    """Fetch job details from Jobs Service."""
    resp = await client.get(f"{settings.jobs_service_url}/{job_id}")
    resp.raise_for_status()
    return resp.json()


async def _fetch_team_profile(client: httpx.AsyncClient) -> dict:
    """Fetch team profile from Auth Service."""
    resp = await client.get(f"{settings.auth_service_url}/team-profile")
    if resp.status_code == 404:
        # Fallback default profile if not configured yet
        return {
            "skills_description": "Full-stack development, Python, React, Node.js",
            "portfolio_description": "Web applications, APIs, data pipelines",
            "hourly_rate_min": 30,
            "hourly_rate_max": 80,
        }
    resp.raise_for_status()
    return resp.json()


async def _analyze_client(client: httpx.AsyncClient, job_data: dict) -> dict:
    """Call client-intel service to analyze the client."""
    client_payload = {
        "upwork_uid": job_data.get("client_upwork_uid"),
        "country": job_data.get("client_country"),
        "payment_verified": job_data.get("client_payment_verified"),
        "rating": job_data.get("client_rating"),
        "total_spent": job_data.get("client_total_spent"),
        "hire_rate": job_data.get("client_hire_rate"),
        "jobs_posted": job_data.get("client_jobs_posted"),
    }
    resp = await client.post(
        f"{settings.client_intel_service_url}/analyze-from-job",
        json=client_payload,
    )
    if resp.status_code != 200:
        logger.warning("client-intel returned %s, using defaults", resp.status_code)
        return {"risk_score": 50.0, **client_payload}
    return resp.json()


async def _update_job_status(
    client: httpx.AsyncClient,
    job_id: int,
    overall_score: float,
    score_details: Optional[dict] = None,
) -> None:
    """Update job status to 'scored' in Jobs Service."""
    payload: dict = {"status": "scored", "overall_score": overall_score}
    if score_details is not None:
        payload["score_details"] = score_details
    resp = await client.patch(
        f"{settings.jobs_service_url}/{job_id}/status",
        json=payload,
    )
    if resp.status_code not in (200, 204):
        logger.warning("Failed to update job %s status: %s", job_id, resp.status_code)


def _job_score_to_response(job_id: int, row: JobScore) -> ScoreResponse:
    return ScoreResponse(
        job_id=job_id,
        skill_match=row.skill_match or 0,
        budget_fit=row.budget_fit or 0,
        scope_clarity=row.scope_clarity or 0,
        win_probability=row.win_probability or 0,
        client_risk=row.client_risk or 0,
        overall_score=row.overall_score or 0,
        llm_reasoning=row.llm_reasoning or "",
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/settings", response_model=ScoringConfigSchema)
async def get_scoring_settings(db: AsyncSession = Depends(get_db)):
    """Get current scoring configuration."""
    result = await db.execute(select(ScoringConfig).where(ScoringConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        return ScoringConfigSchema()  # defaults
    return ScoringConfigSchema.model_validate(config)


@router.put("/settings", response_model=ScoringConfigSchema)
async def update_scoring_settings(
    body: ScoringConfigUpdate, db: AsyncSession = Depends(get_db)
):
    """Update scoring configuration."""
    result = await db.execute(select(ScoringConfig).where(ScoringConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        config = ScoringConfig(id=1)
        db.add(config)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return ScoringConfigSchema.model_validate(config)


@router.post("/score/{job_id}", response_model=ScoreResponse)
async def score_job_endpoint(job_id: int, db: AsyncSession = Depends(get_db)):
    """Score a single job using AI analysis."""
    scoring_config = await get_scoring_config(db)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Fetch job details
        try:
            job_data = await _fetch_job(client, job_id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            raise HTTPException(status_code=502, detail="Jobs service error")
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Jobs service unavailable")

        # 2. Fetch team profile
        try:
            team_profile = await _fetch_team_profile(client)
        except Exception:
            logger.exception("Failed to fetch team profile, using defaults")
            team_profile = {
                "skills_description": "Full-stack development",
                "portfolio_description": "Web applications and APIs",
                "hourly_rate_min": 30,
                "hourly_rate_max": 80,
            }

        # 3. Analyze client via client-intel
        try:
            client_analysis = await _analyze_client(client, job_data)
        except Exception:
            logger.exception("Failed to analyze client, using defaults")
            client_analysis = {"risk_score": 50.0}

        client_risk = float(client_analysis.get("risk_score", 50.0))

        # 4. Build client_data dict for scorer
        client_data = {
            "rating": job_data.get("client_rating"),
            "total_spent": job_data.get("client_total_spent"),
            "hire_rate": job_data.get("client_hire_rate"),
            "payment_verified": job_data.get("client_payment_verified"),
            "jobs_posted": job_data.get("client_jobs_posted"),
            "country": job_data.get("client_country"),
        }

        # 5. Call AI scorer
        scores = await score_job(job_data, client_data, team_profile, scoring_config)
        if scores is None:
            raise HTTPException(status_code=500, detail="AI scoring failed")

        # 6. Save to DB (upsert)
        existing = await db.execute(
            select(JobScore).where(JobScore.job_id == job_id)
        )
        row = existing.scalar_one_or_none()

        if row is None:
            row = JobScore(job_id=job_id)
            db.add(row)

        row.skill_match = scores["skill_match"]
        row.budget_fit = scores["budget_fit"]
        row.scope_clarity = scores["scope_clarity"]
        row.win_probability = scores["win_probability"]
        row.client_risk = client_risk
        row.overall_score = scores["overall_score"]
        row.llm_reasoning = scores["reasoning"]

        await db.commit()
        await db.refresh(row)

        # 7. Update job status in Jobs Service
        try:
            score_details = {
                "skill_match": scores["skill_match"],
                "budget_fit": scores["budget_fit"],
                "scope_clarity": scores["scope_clarity"],
                "win_probability": scores["win_probability"],
                "client_risk": client_risk,
            }
            await _update_job_status(client, job_id, scores["overall_score"], score_details)
        except Exception:
            logger.exception("Failed to update job status for %s", job_id)

        # 8. Publish scored event
        from app.kafka_producer import publish_event
        await publish_event("job.scored", {
            "job_id": job_id,
            "overall_score": scores["overall_score"],
            "skill_match": scores["skill_match"],
            "budget_fit": scores["budget_fit"],
            "scope_clarity": scores["scope_clarity"],
            "win_probability": scores["win_probability"],
            "client_risk": client_risk,
            "title": job_data.get("title", ""),
            "skills": job_data.get("skills", []),
            "upwork_url": job_data.get("upwork_url", ""),
        })

    return _job_score_to_response(job_id, row)


@router.get("/score/{job_id}", response_model=ScoreResponse)
async def get_score(job_id: int, db: AsyncSession = Depends(get_db)):
    """Get existing score for a job."""
    result = await db.execute(
        select(JobScore).where(JobScore.job_id == job_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Score not found")

    return _job_score_to_response(job_id, row)


@router.post("/score-all", response_model=ScoreAllResponse)
async def score_all_jobs(db: AsyncSession = Depends(get_db)):
    """Score all jobs with status 'discovered'."""
    scoring_config = await get_scoring_config(db)
    scored_ids: list[int] = []
    failed_count = 0

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Fetch discovered jobs from Jobs Service
        try:
            resp = await client.get(
                f"{settings.jobs_service_url}",
                params={"status": "discovered", "limit": 100},
            )
            resp.raise_for_status()
            jobs_response = resp.json()
        except Exception:
            logger.exception("Failed to fetch discovered jobs")
            raise HTTPException(status_code=502, detail="Jobs service unavailable")

        items = jobs_response.get("items", [])
        if not items:
            return ScoreAllResponse(scored=0, failed=0, job_ids=[])

        # Fetch team profile once
        try:
            team_profile = await _fetch_team_profile(client)
        except Exception:
            team_profile = {
                "skills_description": "Full-stack development",
                "portfolio_description": "Web applications and APIs",
                "hourly_rate_min": 30,
                "hourly_rate_max": 80,
            }

        for job_data in items:
            job_id = job_data.get("id")
            if job_id is None:
                failed_count += 1
                continue

            try:
                # Analyze client
                try:
                    client_analysis = await _analyze_client(client, job_data)
                except Exception:
                    client_analysis = {"risk_score": 50.0}

                client_risk = float(client_analysis.get("risk_score", 50.0))

                client_data = {
                    "rating": job_data.get("client_rating"),
                    "total_spent": job_data.get("client_total_spent"),
                    "hire_rate": job_data.get("client_hire_rate"),
                    "payment_verified": job_data.get("client_payment_verified"),
                    "jobs_posted": job_data.get("client_jobs_posted"),
                    "country": job_data.get("client_country"),
                }

                scores = await score_job(job_data, client_data, team_profile, scoring_config)
                if scores is None:
                    failed_count += 1
                    continue

                # Upsert score
                existing = await db.execute(
                    select(JobScore).where(JobScore.job_id == job_id)
                )
                row = existing.scalar_one_or_none()
                if row is None:
                    row = JobScore(job_id=job_id)
                    db.add(row)

                row.skill_match = scores["skill_match"]
                row.budget_fit = scores["budget_fit"]
                row.scope_clarity = scores["scope_clarity"]
                row.win_probability = scores["win_probability"]
                row.client_risk = client_risk
                row.overall_score = scores["overall_score"]
                row.llm_reasoning = scores["reasoning"]

                await db.commit()

                # Update job status
                try:
                    score_details = {
                        "skill_match": scores["skill_match"],
                        "budget_fit": scores["budget_fit"],
                        "scope_clarity": scores["scope_clarity"],
                        "win_probability": scores["win_probability"],
                        "client_risk": client_risk,
                    }
                    await _update_job_status(client, job_id, scores["overall_score"], score_details)
                except Exception:
                    logger.warning("Failed to update status for job %s", job_id)

                scored_ids.append(job_id)

            except Exception:
                logger.exception("Failed to score job %s", job_id)
                failed_count += 1

    return ScoreAllResponse(scored=len(scored_ids), failed=failed_count, job_ids=scored_ids)
