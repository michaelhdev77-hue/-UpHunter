"""Jobs Service API routes."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from pydantic import BaseModel, ConfigDict

from app.models import (
    Job,
    JobListResponse,
    JobResponseSchema,
    JobStatus,
    PollerConfig,
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

    old_status = job.status
    job.status = body.status
    if body.overall_score is not None:
        job.overall_score = body.overall_score
    if body.score_details is not None:
        job.score_details = body.score_details
    await db.commit()
    await db.refresh(job)

    # Publish status change event
    from app.kafka_producer import publish_event
    await publish_event("job.status_changed", {
        "job_id": job.id,
        "old_status": old_status.value if hasattr(old_status, 'value') else str(old_status),
        "new_status": body.status.value if hasattr(body.status, 'value') else str(body.status),
        "title": job.title,
        "overall_score": job.overall_score,
        "skills": job.skills or [],
        "upwork_url": job.upwork_url,
    })

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


@router.get("/stats/top")
async def top_jobs(
    limit: int = Query(default=5, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Get top jobs by overall score."""
    result = await db.execute(
        select(Job)
        .where(Job.overall_score.isnot(None))
        .order_by(Job.overall_score.desc())
        .limit(limit)
    )
    jobs = result.scalars().all()
    return [JobResponseSchema.model_validate(j) for j in jobs]


@router.get("/stats/alerts")
async def job_alerts(db: AsyncSession = Depends(get_db)):
    """Get high-priority alerts: high-score unreviewed jobs, unscored jobs count."""
    # High-score jobs not yet applied/approved (score >= 70, status in early stages)
    high_score_result = await db.execute(
        select(Job)
        .where(
            Job.overall_score >= 70,
            Job.status.in_([
                JobStatus.scored, JobStatus.letter_ready,
                JobStatus.under_review, JobStatus.approved,
            ]),
        )
        .order_by(Job.overall_score.desc())
        .limit(5)
    )
    high_score_jobs = high_score_result.scalars().all()

    # Unscored jobs count
    unscored_result = await db.execute(
        select(func.count(Job.id)).where(
            Job.status == JobStatus.discovered,
            Job.overall_score.is_(None),
        )
    )
    unscored_count = unscored_result.scalar() or 0

    # Jobs awaiting review
    review_result = await db.execute(
        select(func.count(Job.id)).where(
            Job.status.in_([JobStatus.letter_ready, JobStatus.under_review])
        )
    )
    awaiting_review = review_result.scalar() or 0

    return {
        "high_score_jobs": [JobResponseSchema.model_validate(j) for j in high_score_jobs],
        "unscored_count": unscored_count,
        "awaiting_review": awaiting_review,
    }


# ── Poller Settings ──────────────────────────────────────────────────────────


class PollerConfigSchema(BaseModel):
    poll_interval_seconds: int = 300
    max_jobs_per_poll: int = 50
    model_config = ConfigDict(from_attributes=True)


class PollerConfigUpdate(BaseModel):
    poll_interval_seconds: int | None = None
    max_jobs_per_poll: int | None = None


@router.get("/settings")
async def get_poller_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PollerConfig).where(PollerConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        return PollerConfigSchema()
    return PollerConfigSchema.model_validate(config)


@router.put("/settings")
async def update_poller_settings(body: PollerConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PollerConfig).where(PollerConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        config = PollerConfig(id=1)
        db.add(config)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return PollerConfigSchema.model_validate(config)


# ── Poller Status & Control ──────────────────────────────────────────────────


@router.get("/poller-status")
async def get_poller_status():
    """Get current poller runtime status (last poll, jobs found, errors)."""
    from app.poller import poller_status
    return poller_status


@router.post("/poll-now")
async def trigger_poll_now():
    """Manually trigger an immediate poll cycle."""
    from app.poller import poll_once, poller_status
    try:
        jobs_found = await poll_once(access_token=None)
        return {"ok": True, "jobs_found": jobs_found}
    except Exception as e:
        poller_status["last_error"] = str(e)
        raise HTTPException(status_code=500, detail=f"Poll failed: {e}")


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


@router.patch("/filters/{filter_id}/toggle")
async def toggle_filter(filter_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle a search filter active/inactive."""
    result = await db.execute(select(SearchFilter).where(SearchFilter.id == filter_id))
    sf = result.scalar_one_or_none()
    if not sf:
        raise HTTPException(status_code=404, detail="Filter not found")
    sf.is_active = not sf.is_active
    await db.commit()
    await db.refresh(sf)
    return SearchFilterResponse.model_validate(sf)
