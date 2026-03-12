"""Background job polling task.

Periodically queries Upwork API for new jobs matching configured filters.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.db import async_session
from app.models import Job, PollerConfig, SearchFilter
from app.upwork_client import UpworkGraphQLClient

logger = logging.getLogger(__name__)

# Runtime status tracking
poller_status = {
    "running": False,
    "last_poll_at": None,
    "last_jobs_found": 0,
    "total_polls": 0,
    "total_jobs_discovered": 0,
    "last_error": None,
    "active_filters": 0,
}


async def _get_poller_config(db) -> tuple[int, int]:
    """Read poller config from DB, falling back to env var defaults."""
    result = await db.execute(select(PollerConfig).where(PollerConfig.id == 1))
    config = result.scalar_one_or_none()
    if config:
        return config.poll_interval_seconds, config.max_jobs_per_poll
    return settings.jobs_poll_interval_seconds, 50


async def poll_once(access_token: str | None = None):
    """Run a single poll cycle: fetch jobs from Upwork, save new ones."""
    client = UpworkGraphQLClient(access_token=access_token)

    async with async_session() as db:
        # Read runtime poller config
        _, max_jobs = await _get_poller_config(db)

        # Get active filters
        result = await db.execute(
            select(SearchFilter).where(SearchFilter.is_active.is_(True))
        )
        filters = result.scalars().all()

        if not filters:
            logger.info("No active search filters — using default search")
            filters = [None]

        total_new = 0

        for f in filters:
            keywords = f.keywords if f else None
            skills = f.skills if f else None
            category = f.category if f else None
            contract_type = f.contract_type.value if f and f.contract_type else None
            experience_level = f.experience_level.value if f and f.experience_level else None
            budget_min = f.budget_min if f else None
            budget_max = f.budget_max if f else None

            try:
                jobs = await client.search_jobs(
                    keywords=keywords,
                    skills=skills,
                    category=category,
                    contract_type=contract_type,
                    experience_level=experience_level,
                    budget_min=budget_min,
                    budget_max=budget_max,
                    limit=max_jobs,
                )
            except Exception as e:
                logger.error("Failed to fetch jobs: %s", e)
                continue

            for job_data in jobs:
                # Check if already exists
                existing = await db.execute(
                    select(Job.id).where(Job.upwork_id == job_data.upwork_id)
                )
                if existing.scalar_one_or_none():
                    continue

                # Create new job
                job = Job(
                    upwork_id=job_data.upwork_id,
                    title=job_data.title,
                    description=job_data.description,
                    category=job_data.category,
                    subcategory=job_data.subcategory,
                    contract_type=job_data.contract_type,
                    budget_min=job_data.budget_min,
                    budget_max=job_data.budget_max,
                    hourly_rate_min=job_data.hourly_rate_min,
                    hourly_rate_max=job_data.hourly_rate_max,
                    duration=job_data.duration,
                    duration_label=job_data.duration_label,
                    engagement=job_data.engagement,
                    experience_level=job_data.experience_level,
                    skills=job_data.skills,
                    connect_price=job_data.connect_price,
                    proposals_count=job_data.proposals_count,
                    detected_language=job_data.detected_language,
                    upwork_url=job_data.upwork_url,
                    posted_at=job_data.posted_at,
                )

                if job_data.client:
                    job.client_upwork_uid = job_data.client.upwork_uid
                    job.client_country = job_data.client.country
                    job.client_payment_verified = job_data.client.payment_verified
                    job.client_rating = job_data.client.rating
                    job.client_total_spent = job_data.client.total_spent
                    job.client_hire_rate = job_data.client.hire_rate
                    job.client_jobs_posted = job_data.client.jobs_posted
                    job.client_member_since = job_data.client.member_since

                db.add(job)
                await db.flush()  # get job.id

                # Publish Kafka event
                from app.kafka_producer import publish_event
                await publish_event("job.discovered", {
                    "job_id": job.id,
                    "title": job.title,
                    "skills": job.skills or [],
                    "upwork_url": job.upwork_url,
                })
                total_new += 1

            await db.commit()

        poller_status["last_poll_at"] = datetime.now(timezone.utc).isoformat()
        poller_status["last_jobs_found"] = total_new
        poller_status["total_polls"] += 1
        poller_status["total_jobs_discovered"] += total_new
        poller_status["active_filters"] = len([f for f in filters if f is not None])
        poller_status["last_error"] = None

        logger.info("Poll complete: %d new jobs discovered", total_new)
        return total_new


async def run_poller():
    """Run polling loop in background."""
    logger.info(
        "Starting job poller (default interval: %ds)", settings.jobs_poll_interval_seconds
    )
    poller_status["running"] = True
    while True:
        try:
            # TODO: Get access_token from auth service
            await poll_once(access_token=None)
        except Exception as e:
            logger.error("Poller error: %s", e)
            poller_status["last_error"] = str(e)

        # Read current interval from DB (allows runtime reconfiguration)
        try:
            async with async_session() as db:
                poll_interval, _ = await _get_poller_config(db)
        except Exception:
            poll_interval = settings.jobs_poll_interval_seconds

        await asyncio.sleep(poll_interval)
