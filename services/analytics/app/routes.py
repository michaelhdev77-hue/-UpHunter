"""Analytics Service API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import FunnelEvent, FunnelEventCreate, FunnelStageCount, FunnelStats

router = APIRouter()


@router.post("/events")
async def record_event(body: FunnelEventCreate, db: AsyncSession = Depends(get_db)):
    """Record a funnel event."""
    event = FunnelEvent(
        job_id=body.job_id,
        stage=body.stage,
        metadata_=body.metadata,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return {"ok": True, "event_id": event.id}


@router.get("/funnel", response_model=FunnelStats)
async def get_funnel_stats(db: AsyncSession = Depends(get_db)):
    """Get funnel stats grouped by stage."""
    result = await db.execute(
        select(FunnelEvent.stage, func.count(FunnelEvent.id))
        .group_by(FunnelEvent.stage)
        .order_by(func.count(FunnelEvent.id).desc())
    )
    rows = result.all()

    stages = [FunnelStageCount(stage=row[0], count=row[1]) for row in rows]
    total = sum(s.count for s in stages)

    return FunnelStats(stages=stages, total_events=total)


@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    """Get overall summary statistics."""
    # Total events
    total_result = await db.execute(select(func.count(FunnelEvent.id)))
    total_events = total_result.scalar() or 0

    # Unique jobs
    unique_jobs_result = await db.execute(
        select(func.count(func.distinct(FunnelEvent.job_id)))
    )
    unique_jobs = unique_jobs_result.scalar() or 0

    # Events by stage
    stage_result = await db.execute(
        select(FunnelEvent.stage, func.count(FunnelEvent.id))
        .group_by(FunnelEvent.stage)
    )
    by_stage = {row[0]: row[1] for row in stage_result.all()}

    return {
        "total_events": total_events,
        "unique_jobs": unique_jobs,
        "by_stage": by_stage,
    }
