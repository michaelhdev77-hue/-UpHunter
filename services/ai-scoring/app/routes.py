"""AI Scoring Service API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db

router = APIRouter()


class ScoreResponse(BaseModel):
    job_id: int
    skill_match: float
    budget_fit: float
    scope_clarity: float
    win_probability: float
    client_risk: float
    overall_score: float
    llm_reasoning: str


@router.post("/score/{job_id}", response_model=ScoreResponse)
async def score_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Score a job using AI analysis.

    TODO: Integrate with OpenAI API to perform actual scoring.
    Currently returns mock data for development purposes.
    """
    # TODO: Fetch job details from Jobs Service
    # TODO: Fetch client risk from Client Intel Service
    # TODO: Call OpenAI API with job description, client info, and team profile
    # TODO: Parse LLM response into structured scores
    # TODO: Store scores in the database

    return ScoreResponse(
        job_id=job_id,
        skill_match=75.0,
        budget_fit=80.0,
        scope_clarity=65.0,
        win_probability=70.0,
        client_risk=20.0,
        overall_score=72.0,
        llm_reasoning="Mock scoring result. OpenAI integration pending.",
    )


@router.get("/score/{job_id}", response_model=ScoreResponse)
async def get_score(job_id: int, db: AsyncSession = Depends(get_db)):
    """Get existing score for a job."""
    # TODO: Fetch score from database
    raise HTTPException(status_code=404, detail="Score not found")
