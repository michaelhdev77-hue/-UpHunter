"""Jobs Service API routes."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import (
    Job,
    JobListResponse,
    JobResponseSchema,
    JobStatus,
    SearchFilter,
    SearchFilterCreate,
    SearchFilterResponse,
    StatusUpdateSchema,
)

router = APIRouter()


@router.get("/", response_model=JobListResponse)
async def list_jobs(
    status: Optional[JobStatus] = None,
    min_score: Optional[float] = None,
    skill: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List jobs with optional filters."""
    query = select(Job).order_by(Job.discovered_at.desc())

    if status:
        query = query.where(Job.status == status)
    if min_score is not None:
        query = query.where(Job.overall_score >= min_score)
    if skill:
        query = query.where(Job.skills.any(skill))
    if search:
        query = query.where(
            Job.title.ilike(f"%{search}%") | Job.description.ilike(f"%{search}%")
        )

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return JobListResponse(
        total=total,
        items=[JobResponseSchema.model_validate(j) for j in jobs],
    )


@router.get("/{job_id}", response_model=JobResponseSchema)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single job by ID."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponseSchema.model_validate(job)


@router.patch("/{job_id}/status", response_model=JobResponseSchema)
async def update_job_status(
    job_id: int,
    body: StatusUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    """Update job pipeline status."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = body.status
    await db.commit()
    await db.refresh(job)
    return JobResponseSchema.model_validate(job)


@router.get("/stats/summary")
async def jobs_summary(db: AsyncSession = Depends(get_db)):
    """Get pipeline statistics."""
    result = await db.execute(
        select(Job.status, func.count(Job.id)).group_by(Job.status)
    )
    counts = {row[0].value: row[1] for row in result.all()}
    return {
        "total": sum(counts.values()),
        "by_status": counts,
    }


# ── Search Filters ───────────────────────────────────────────────────────────


@router.get("/filters/list", response_model=list[SearchFilterResponse])
async def list_filters(db: AsyncSession = Depends(get_db)):
    """List all search filters."""
    result = await db.execute(
        select(SearchFilter).order_by(SearchFilter.created_at.desc())
    )
    return [SearchFilterResponse.model_validate(f) for f in result.scalars().all()]


@router.post("/filters", response_model=SearchFilterResponse)
async def create_filter(
    body: SearchFilterCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new search filter."""
    f = SearchFilter(**body.model_dump())
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return SearchFilterResponse.model_validate(f)


@router.delete("/filters/{filter_id}")
async def delete_filter(filter_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a search filter."""
    result = await db.execute(select(SearchFilter).where(SearchFilter.id == filter_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Filter not found")
    await db.delete(f)
    await db.commit()
    return {"ok": True}
