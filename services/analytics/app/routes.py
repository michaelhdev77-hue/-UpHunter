"""Analytics Service API routes."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import FunnelEvent, TelegramConfig

logger = logging.getLogger(__name__)

router = APIRouter()

# -- Response schemas --

FUNNEL_ORDER = [
    "discovered", "scored", "letter_ready", "under_review",
    "applied", "response", "hired", "rejected",
]


class FunnelStage(BaseModel):
    stage: str
    count: int
    conversion_rate: Optional[float] = None


class FunnelResponse(BaseModel):
    stages: list[FunnelStage]
    total_jobs: int


class TimeSeriesPoint(BaseModel):
    date: str
    discovered: int = 0
    scored: int = 0
    letter_ready: int = 0
    applied: int = 0


class AnalyticsSummary(BaseModel):
    total_events: int
    unique_jobs: int
    by_stage: dict[str, int]
    avg_score: Optional[float] = None
    conversion_rates: dict[str, float]


class ScoreBucket(BaseModel):
    range: str
    count: int


# -- Endpoints --


@router.post("/events")
async def record_event(
    job_id: int,
    stage: str,
    metadata: Optional[dict] = None,
    db: AsyncSession = Depends(get_db),
):
    """Record a funnel event."""
    event = FunnelEvent(job_id=job_id, stage=stage, metadata_=metadata)
    db.add(event)
    await db.commit()
    return {"ok": True, "event_id": event.id}


@router.get("/funnel", response_model=FunnelResponse)
async def get_funnel(db: AsyncSession = Depends(get_db)):
    """Get funnel stats with conversion rates."""
    # Count distinct jobs per stage
    result = await db.execute(
        select(
            FunnelEvent.stage,
            func.count(func.distinct(FunnelEvent.job_id)),
        ).group_by(FunnelEvent.stage)
    )
    stage_counts = {row[0]: row[1] for row in result.all()}

    stages = []
    prev_count = None
    for s in FUNNEL_ORDER:
        count = stage_counts.get(s, 0)
        conv = None
        if prev_count and prev_count > 0 and s != "rejected":
            conv = round(count / prev_count * 100, 1)
        stages.append(FunnelStage(stage=s, count=count, conversion_rate=conv))
        if s != "rejected":
            prev_count = count if count > 0 else prev_count

    total = stage_counts.get("discovered", 0)
    return FunnelResponse(stages=stages, total_jobs=total)


@router.get("/summary", response_model=AnalyticsSummary)
async def get_summary(db: AsyncSession = Depends(get_db)):
    """Get overall summary with conversion rates."""
    # Total events
    total_result = await db.execute(select(func.count(FunnelEvent.id)))
    total_events = total_result.scalar() or 0

    # Unique jobs
    unique_result = await db.execute(
        select(func.count(func.distinct(FunnelEvent.job_id)))
    )
    unique_jobs = unique_result.scalar() or 0

    # By stage
    stage_result = await db.execute(
        select(FunnelEvent.stage, func.count(func.distinct(FunnelEvent.job_id)))
        .group_by(FunnelEvent.stage)
    )
    by_stage = {row[0]: row[1] for row in stage_result.all()}

    # Avg score from scored events metadata
    score_result = await db.execute(
        select(FunnelEvent.metadata_)
        .where(FunnelEvent.stage == "scored")
    )
    scores = []
    for row in score_result.all():
        meta = row[0]
        if meta and "overall_score" in meta:
            scores.append(float(meta["overall_score"]))
    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    # Conversion rates
    discovered = by_stage.get("discovered", 0)
    conversion_rates = {}
    if discovered > 0:
        for stage in ["scored", "letter_ready", "applied", "hired"]:
            conversion_rates[f"discovered_to_{stage}"] = round(
                by_stage.get(stage, 0) / discovered * 100, 1
            )

    return AnalyticsSummary(
        total_events=total_events,
        unique_jobs=unique_jobs,
        by_stage=by_stage,
        avg_score=avg_score,
        conversion_rates=conversion_rates,
    )


@router.get("/time-series", response_model=list[TimeSeriesPoint])
async def get_time_series(
    days: int = Query(default=30, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Get events per day for charting."""
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(
            cast(FunnelEvent.timestamp, Date).label("date"),
            FunnelEvent.stage,
            func.count(FunnelEvent.id),
        )
        .where(FunnelEvent.timestamp >= since)
        .group_by("date", FunnelEvent.stage)
        .order_by("date")
    )

    # Pivot: date -> {stage: count}
    day_data: dict[str, dict[str, int]] = {}
    for row in result.all():
        d = str(row[0])
        if d not in day_data:
            day_data[d] = {}
        day_data[d][row[1]] = row[2]

    points = []
    for d in sorted(day_data.keys()):
        data = day_data[d]
        points.append(TimeSeriesPoint(
            date=d,
            discovered=data.get("discovered", 0),
            scored=data.get("scored", 0),
            letter_ready=data.get("letter_ready", 0),
            applied=data.get("applied", 0),
        ))

    return points


@router.get("/score-distribution", response_model=list[ScoreBucket])
async def get_score_distribution(db: AsyncSession = Depends(get_db)):
    """Get score histogram from scored events."""
    result = await db.execute(
        select(FunnelEvent.metadata_)
        .where(FunnelEvent.stage == "scored")
    )

    buckets = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
    for row in result.all():
        meta = row[0]
        if not meta or "overall_score" not in meta:
            continue
        score = float(meta["overall_score"])
        if score < 20:
            buckets["0-20"] += 1
        elif score < 40:
            buckets["20-40"] += 1
        elif score < 60:
            buckets["40-60"] += 1
        elif score < 80:
            buckets["60-80"] += 1
        else:
            buckets["80-100"] += 1

    return [ScoreBucket(range=k, count=v) for k, v in buckets.items()]


class HeatmapCell(BaseModel):
    day: int  # 0=Mon .. 6=Sun
    hour: int  # 0-23
    count: int


class SkillStat(BaseModel):
    skill: str
    count: int
    avg_score: Optional[float] = None


@router.get("/heatmap", response_model=list[HeatmapCell])
async def get_activity_heatmap(db: AsyncSession = Depends(get_db)):
    """Get activity heatmap by day of week and hour."""
    result = await db.execute(
        select(FunnelEvent.timestamp)
        .where(FunnelEvent.stage == "discovered")
    )
    # Build heatmap in Python (simpler than DB-specific extract)
    grid: dict[tuple[int, int], int] = {}
    for row in result.all():
        ts = row[0]
        if ts is None:
            continue
        key = (ts.weekday(), ts.hour)
        grid[key] = grid.get(key, 0) + 1

    cells = []
    for day in range(7):
        for hour in range(24):
            count = grid.get((day, hour), 0)
            if count > 0:
                cells.append(HeatmapCell(day=day, hour=hour, count=count))
    return cells


@router.get("/top-skills", response_model=list[SkillStat])
async def get_top_skills(
    limit: int = Query(default=15, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get most frequent skills from discovered jobs with avg scores."""
    result = await db.execute(
        select(FunnelEvent.metadata_)
        .where(FunnelEvent.stage.in_(["discovered", "scored"]))
    )

    skill_counts: dict[str, int] = {}
    skill_scores: dict[str, list[float]] = {}

    for row in result.all():
        meta = row[0]
        if not meta:
            continue
        skills = meta.get("skills", [])
        score = meta.get("overall_score")
        for sk in skills:
            sk_lower = sk.strip()
            if not sk_lower:
                continue
            skill_counts[sk_lower] = skill_counts.get(sk_lower, 0) + 1
            if score is not None:
                if sk_lower not in skill_scores:
                    skill_scores[sk_lower] = []
                skill_scores[sk_lower].append(float(score))

    # Sort by count, take top N
    sorted_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

    return [
        SkillStat(
            skill=sk,
            count=cnt,
            avg_score=round(sum(skill_scores.get(sk, [])) / len(skill_scores[sk]), 1)
            if sk in skill_scores and skill_scores[sk]
            else None,
        )
        for sk, cnt in sorted_skills
    ]


class MarketTrend(BaseModel):
    avg_budget_min: Optional[float] = None
    avg_budget_max: Optional[float] = None
    total_jobs: int = 0
    avg_score: Optional[float] = None
    top_skills: list[dict] = []
    experience_distribution: dict[str, int] = {}
    contract_type_distribution: dict[str, int] = {}


@router.get("/market-intel", response_model=MarketTrend)
async def get_market_intelligence(db: AsyncSession = Depends(get_db)):
    """Market intelligence from all discovered jobs metadata."""
    result = await db.execute(
        select(FunnelEvent.metadata_)
        .where(FunnelEvent.stage == "discovered")
    )

    budgets_min = []
    budgets_max = []
    scores = []
    skill_counts: dict[str, int] = {}
    exp_dist: dict[str, int] = {}
    contract_dist: dict[str, int] = {}
    total = 0

    for row in result.all():
        meta = row[0]
        if not meta:
            continue
        total += 1

        # Budget
        bmin = meta.get("budget_min")
        bmax = meta.get("budget_max")
        if bmin is not None and bmin > 0:
            budgets_min.append(float(bmin))
        if bmax is not None and bmax > 0:
            budgets_max.append(float(bmax))

        # Score
        score = meta.get("overall_score")
        if score is not None:
            scores.append(float(score))

        # Skills
        for sk in meta.get("skills", []):
            sk = sk.strip()
            if sk:
                skill_counts[sk] = skill_counts.get(sk, 0) + 1

        # Experience level
        exp = meta.get("experience_level")
        if exp:
            exp_dist[exp] = exp_dist.get(exp, 0) + 1

        # Contract type
        ct = meta.get("contract_type")
        if ct:
            contract_dist[ct] = contract_dist.get(ct, 0) + 1

    # Top 10 skills
    sorted_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return MarketTrend(
        avg_budget_min=round(sum(budgets_min) / len(budgets_min), 0) if budgets_min else None,
        avg_budget_max=round(sum(budgets_max) / len(budgets_max), 0) if budgets_max else None,
        total_jobs=total,
        avg_score=round(sum(scores) / len(scores), 1) if scores else None,
        top_skills=[{"skill": s, "count": c} for s, c in sorted_skills],
        experience_distribution=exp_dist,
        contract_type_distribution=contract_dist,
    )


# -- Telegram Settings Schemas --


class TelegramConfigSchema(BaseModel):
    bot_token: str = ""
    chat_id: str = ""
    enabled: bool = False
    score_threshold: int = 70
    frontend_url: str = "http://localhost:3002"
    model_config = ConfigDict(from_attributes=True)


class TelegramConfigUpdate(BaseModel):
    bot_token: str | None = None
    chat_id: str | None = None
    enabled: bool | None = None
    score_threshold: int | None = None
    frontend_url: str | None = None


@router.get("/settings/telegram", response_model=TelegramConfigSchema)
async def get_telegram_settings(db: AsyncSession = Depends(get_db)):
    """Get current Telegram notification settings."""
    result = await db.execute(select(TelegramConfig).where(TelegramConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        # Return defaults from env as fallback
        return TelegramConfigSchema(
            bot_token=settings.telegram_bot_token,
            chat_id=settings.telegram_chat_id,
            enabled=settings.telegram_enabled,
            score_threshold=settings.telegram_score_threshold,
            frontend_url=settings.frontend_url,
        )
    return TelegramConfigSchema.model_validate(config)


@router.put("/settings/telegram", response_model=TelegramConfigSchema)
async def update_telegram_settings(
    body: TelegramConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update Telegram notification settings."""
    result = await db.execute(select(TelegramConfig).where(TelegramConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        config = TelegramConfig(id=1)
        db.add(config)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return TelegramConfigSchema.model_validate(config)


@router.post("/backfill")
async def backfill_from_jobs(db: AsyncSession = Depends(get_db)):
    """Backfill analytics from existing jobs data."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{settings.jobs_service_url}/",
                params={"limit": 200},
            )
            resp.raise_for_status()
            jobs_data = resp.json()
    except Exception:
        logger.exception("Failed to fetch jobs for backfill")
        return {"ok": False, "error": "Failed to fetch jobs"}

    items = jobs_data.get("items", [])
    created = 0

    # Status to stages mapping: a job in "scored" status has been through "discovered" and "scored"
    stage_order = ["discovered", "scored", "letter_ready", "under_review", "applied", "response", "hired"]

    for job in items:
        job_id = job.get("id")
        status = job.get("status", "discovered")

        # Check if already backfilled
        existing = await db.execute(
            select(func.count(FunnelEvent.id))
            .where(FunnelEvent.job_id == job_id)
        )
        if (existing.scalar() or 0) > 0:
            continue

        # Determine which stages this job has passed through
        if status == "rejected":
            stages_passed = ["discovered"]
        elif status in stage_order:
            idx = stage_order.index(status)
            stages_passed = stage_order[: idx + 1]
        else:
            stages_passed = ["discovered"]

        for stage in stages_passed:
            event = FunnelEvent(
                job_id=job_id,
                stage=stage,
                metadata_={
                    "job_id": job_id,
                    "title": job.get("title", ""),
                    "overall_score": job.get("overall_score"),
                    "skills": job.get("skills", []),
                    "upwork_url": job.get("upwork_url", ""),
                    "backfilled": True,
                },
            )
            db.add(event)
            created += 1

    await db.commit()
    logger.info("Backfilled %d events from %d jobs", created, len(items))
    return {"ok": True, "events_created": created, "jobs_processed": len(items)}


# ── Telegram Test ───────────────────────────────────────────────────────────


@router.post("/test-telegram")
async def test_telegram(db: AsyncSession = Depends(get_db)):
    """Send a test message to configured Telegram chat."""
    result = await db.execute(select(TelegramConfig).where(TelegramConfig.id == 1))
    config = result.scalar_one_or_none()

    bot_token = config.bot_token if config and config.bot_token else settings.telegram_bot_token
    chat_id = config.chat_id if config and config.chat_id else settings.telegram_chat_id

    if not bot_token or not chat_id:
        return {"ok": False, "error": "Telegram bot_token or chat_id not configured"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": "UpHunter test notification. If you see this, Telegram is configured correctly!",
                    "parse_mode": "HTML",
                },
            )
            resp.raise_for_status()
        return {"ok": True, "message": "Test message sent successfully"}
    except Exception as e:
        logger.error("Telegram test failed: %s", e)
        return {"ok": False, "error": str(e)}
