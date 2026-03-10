"""Background job polling task.

Periodically queries Upwork API for new jobs matching configured filters.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.config import settings
from app.db import async_session
from app.models import Job, SearchFilter
from app.upwork_client import UpworkGraphQLClient

logger = logging.getLogger(__name__)


async def poll_once(access_token: str | None = None):
    """Run a single poll cycle: fetch jobs from Upwork, save new ones."""
    client = UpworkGraphQLClient(access_token=access_token)

    async with async_session() as db:
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

            try:
                jobs = await client.search_jobs(
                    keywords=keywords,
                    skills=skills,
                    category=category,
                    limit=50,
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
                total_new += 1

            await db.commit()

        logger.info("Poll complete: %d new jobs discovered", total_new)
        return total_new


async def run_poller():
    """Run polling loop in background."""
    logger.info(
        "Starting job poller (interval: %ds)", settings.jobs_poll_interval_seconds
    )
    while True:
        try:
            # TODO: Get access_token from auth service
            await poll_once(access_token=None)
        except Exception as e:
            logger.error("Poller error: %s", e)

        await asyncio.sleep(settings.jobs_poll_interval_seconds)
