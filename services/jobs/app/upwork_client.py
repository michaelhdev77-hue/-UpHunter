"""Upwork GraphQL API client.

Uses the official GraphQL API for job search.
Falls back to mock data when no API key is configured.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

import httpx

from app.config import settings
from app.models import ClientInfoSchema, JobCreateSchema

logger = logging.getLogger(__name__)

# ── GraphQL Queries ──────────────────────────────────────────────────────────

SEARCH_JOBS_QUERY = """
query MarketplaceJobPostings(
    $filter: MarketplaceJobFilter,
    $sortAttributes: [MarketplaceJobPostingSortAttribute],
    $pagination: PaginationInput
) {
    marketplaceJobPostings(
        marketPlaceJobFilter: $filter,
        sortAttributes: $sortAttributes,
        pagination: $pagination
    ) {
        totalCount
        edges {
            node {
                id
                ciphertext
                title
                description
                createdDateTime
                duration
                durationLabel
                engagement
                amount {
                    amount
                    currencyCode
                }
                hourlyBudgetMin {
                    amount
                }
                hourlyBudgetMax {
                    amount
                }
                contractorTier
                skills {
                    name
                    prettyName
                }
                connectPrice
                proposalsTier
                client {
                    totalSpent {
                        amount
                    }
                    totalHires
                    totalPostedJobs
                    totalReviews
                    companyName
                    paymentVerificationStatus
                    location {
                        country
                        city
                    }
                    memberSince
                    rating {
                        overallScore
                    }
                }
                category {
                    name
                }
                subcategory {
                    name
                }
            }
        }
        pageInfo {
            hasNextPage
            endCursor
        }
    }
}
"""

JOB_DETAIL_QUERY = """
query MarketplaceJobPosting($id: ID!) {
    marketplaceJobPosting(id: $id) {
        id
        ciphertext
        title
        description
        createdDateTime
        duration
        durationLabel
        engagement
        amount {
            amount
            currencyCode
        }
        hourlyBudgetMin { amount }
        hourlyBudgetMax { amount }
        contractorTier
        skills { name prettyName }
        connectPrice
        client {
            totalSpent { amount }
            totalHires
            totalPostedJobs
            totalReviews
            companyName
            paymentVerificationStatus
            location { country city }
            memberSince
            rating { overallScore }
        }
        category { name }
        subcategory { name }
    }
}
"""


def _parse_tier(tier: str | None) -> str | None:
    mapping = {
        "ENTRY": "entry",
        "INTERMEDIATE": "intermediate",
        "EXPERT": "expert",
    }
    return mapping.get(tier) if tier else None


def _parse_job_node(node: dict[str, Any]) -> JobCreateSchema:
    """Convert a GraphQL job node into our internal schema."""
    client_data = node.get("client") or {}
    client = ClientInfoSchema(
        country=client_data.get("location", {}).get("country") if client_data.get("location") else None,
        payment_verified=client_data.get("paymentVerificationStatus") == "VERIFIED",
        rating=(client_data.get("rating") or {}).get("overallScore"),
        total_spent=(client_data.get("totalSpent") or {}).get("amount"),
        jobs_posted=client_data.get("totalPostedJobs"),
        hire_rate=None,  # Computed from totalHires/totalPostedJobs
        member_since=None,
    )

    total_hires = client_data.get("totalHires")
    total_posted = client_data.get("totalPostedJobs")
    if total_hires is not None and total_posted and total_posted > 0:
        client.hire_rate = round((total_hires / total_posted) * 100, 1)

    member_since_raw = client_data.get("memberSince")
    if member_since_raw:
        try:
            client.member_since = datetime.fromisoformat(member_since_raw.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    amount = node.get("amount") or {}
    budget = amount.get("amount")

    skills = [s.get("prettyName") or s.get("name", "") for s in (node.get("skills") or [])]

    ciphertext = node.get("ciphertext", "")
    upwork_url = f"https://www.upwork.com/jobs/{ciphertext}" if ciphertext else None

    return JobCreateSchema(
        upwork_id=node["id"],
        title=node.get("title", ""),
        description=node.get("description", ""),
        category=(node.get("category") or {}).get("name"),
        subcategory=(node.get("subcategory") or {}).get("name"),
        contract_type="fixed" if budget else "hourly",
        budget_min=budget,
        budget_max=budget,
        hourly_rate_min=(node.get("hourlyBudgetMin") or {}).get("amount"),
        hourly_rate_max=(node.get("hourlyBudgetMax") or {}).get("amount"),
        duration=node.get("duration"),
        duration_label=node.get("durationLabel"),
        engagement=node.get("engagement"),
        experience_level=_parse_tier(node.get("contractorTier")),
        skills=skills,
        connect_price=node.get("connectPrice"),
        detected_language="en",
        upwork_url=upwork_url,
        client=client,
        posted_at=None,
    )


class UpworkGraphQLClient:
    """Client for the Upwork GraphQL API."""

    def __init__(self, access_token: Optional[str] = None):
        self.api_url = settings.upwork_api_url
        self.access_token = access_token

    async def search_jobs(
        self,
        keywords: list[str] | None = None,
        skills: list[str] | None = None,
        category: str | None = None,
        limit: int = 50,
    ) -> list[JobCreateSchema]:
        """Search Upwork marketplace for jobs matching filters."""
        if not self.access_token:
            logger.warning("No Upwork access token — returning mock data")
            return _get_mock_jobs()

        filter_input: dict[str, Any] = {}
        if keywords:
            filter_input["searchTerm_eq"] = " ".join(keywords)
        if skills:
            filter_input["skills_any"] = skills

        variables = {
            "filter": filter_input,
            "pagination": {"first": limit},
            "sortAttributes": [{"field": "RECENCY", "sortOrder": "DESC"}],
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                self.api_url,
                json={"query": SEARCH_JOBS_QUERY, "variables": variables},
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        if "errors" in data:
            logger.error("Upwork GraphQL errors: %s", data["errors"])
            return []

        edges = (
            data.get("data", {})
            .get("marketplaceJobPostings", {})
            .get("edges", [])
        )

        jobs = []
        for edge in edges:
            node = edge.get("node")
            if node:
                try:
                    jobs.append(_parse_job_node(node))
                except Exception as e:
                    logger.warning("Failed to parse job node: %s", e)

        logger.info("Fetched %d jobs from Upwork API", len(jobs))
        return jobs

    async def get_job_detail(self, job_id: str) -> Optional[JobCreateSchema]:
        """Fetch single job posting details."""
        if not self.access_token:
            return None

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                self.api_url,
                json={"query": JOB_DETAIL_QUERY, "variables": {"id": job_id}},
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        node = data.get("data", {}).get("marketplaceJobPosting")
        if not node:
            return None
        return _parse_job_node(node)


# ── Mock Data (used when no API key is available) ────────────────────────────


def _get_mock_jobs() -> list[JobCreateSchema]:
    """Return realistic mock job data for development."""
    return [
        JobCreateSchema(
            upwork_id="mock-001",
            title="Full-Stack Developer for SaaS Platform (React + Python)",
            description=(
                "We are looking for an experienced full-stack developer to help build "
                "and maintain our SaaS platform. The ideal candidate has experience with "
                "React, TypeScript, Python/FastAPI, PostgreSQL, and Docker.\n\n"
                "Requirements:\n"
                "- 3+ years of experience with React and TypeScript\n"
                "- 2+ years of Python backend development (FastAPI preferred)\n"
                "- Experience with PostgreSQL and Redis\n"
                "- Docker and CI/CD pipeline experience\n"
                "- Good communication skills in English\n\n"
                "This is an ongoing project with 20-30 hours per week."
            ),
            category="Web Development",
            contract_type="hourly",
            hourly_rate_min=40.0,
            hourly_rate_max=70.0,
            duration="3-6 months",
            experience_level="expert",
            skills=["React", "TypeScript", "Python", "FastAPI", "PostgreSQL", "Docker"],
            connect_price=16,
            proposals_count=12,
            upwork_url="https://www.upwork.com/jobs/~mock001",
            client=ClientInfoSchema(
                country="United States",
                payment_verified=True,
                rating=4.9,
                total_spent=150000.0,
                hire_rate=85.0,
                jobs_posted=47,
                member_since=datetime(2019, 3, 15),
            ),
        ),
        JobCreateSchema(
            upwork_id="mock-002",
            title="Build REST API with Node.js and MongoDB",
            description=(
                "Need a backend developer to build a REST API for our mobile app. "
                "The API should handle user authentication, data CRUD operations, "
                "and integrate with Stripe for payments.\n\n"
                "Budget: $2,000-3,000\n"
                "Timeline: 2-3 weeks"
            ),
            category="Web Development",
            contract_type="fixed",
            budget_min=2000.0,
            budget_max=3000.0,
            duration="Less than 1 month",
            experience_level="intermediate",
            skills=["Node.js", "MongoDB", "REST API", "Stripe"],
            connect_price=12,
            proposals_count=25,
            upwork_url="https://www.upwork.com/jobs/~mock002",
            client=ClientInfoSchema(
                country="Germany",
                payment_verified=True,
                rating=4.5,
                total_spent=8500.0,
                hire_rate=60.0,
                jobs_posted=10,
                member_since=datetime(2022, 1, 10),
            ),
        ),
        JobCreateSchema(
            upwork_id="mock-003",
            title="WordPress Website Fix - Urgent",
            description=(
                "My WordPress site is broken after an update. Need someone to fix it ASAP. "
                "Should take about 1-2 hours."
            ),
            category="Web Development",
            contract_type="fixed",
            budget_min=50.0,
            budget_max=50.0,
            duration="Less than 1 week",
            experience_level="entry",
            skills=["WordPress", "PHP", "CSS"],
            connect_price=4,
            proposals_count=45,
            upwork_url="https://www.upwork.com/jobs/~mock003",
            client=ClientInfoSchema(
                country="India",
                payment_verified=False,
                rating=0.0,
                total_spent=0.0,
                hire_rate=0.0,
                jobs_posted=1,
                member_since=datetime(2026, 3, 1),
            ),
        ),
        JobCreateSchema(
            upwork_id="mock-004",
            title="AI/ML Engineer - Computer Vision Pipeline",
            description=(
                "We need an ML engineer to develop a computer vision pipeline for our "
                "autonomous drone system. You will work on object detection, tracking, "
                "and segmentation using PyTorch.\n\n"
                "Requirements:\n"
                "- PhD or MS in Computer Science / ML\n"
                "- 5+ years experience with PyTorch\n"
                "- Experience with YOLO, DETR, or similar architectures\n"
                "- Knowledge of ONNX export and TensorRT optimization\n"
                "- Experience deploying models on edge devices (Jetson)\n\n"
                "Long-term engagement, 40 hours per week."
            ),
            category="AI & Machine Learning",
            contract_type="hourly",
            hourly_rate_min=80.0,
            hourly_rate_max=150.0,
            duration="More than 6 months",
            experience_level="expert",
            skills=["Python", "PyTorch", "Computer Vision", "YOLO", "TensorRT", "Docker"],
            connect_price=16,
            proposals_count=8,
            upwork_url="https://www.upwork.com/jobs/~mock004",
            client=ClientInfoSchema(
                country="United States",
                payment_verified=True,
                rating=5.0,
                total_spent=500000.0,
                hire_rate=92.0,
                jobs_posted=85,
                member_since=datetime(2017, 6, 20),
            ),
        ),
        JobCreateSchema(
            upwork_id="mock-005",
            title="Mobile App Development - React Native",
            description=(
                "Looking for a React Native developer to build a fitness tracking app. "
                "Design is ready in Figma. Need both iOS and Android versions.\n\n"
                "Features: workout tracking, social feed, push notifications, "
                "in-app purchases, Apple Health / Google Fit integration."
            ),
            category="Mobile Development",
            contract_type="fixed",
            budget_min=10000.0,
            budget_max=15000.0,
            duration="1-3 months",
            experience_level="expert",
            skills=["React Native", "TypeScript", "iOS", "Android", "Firebase"],
            connect_price=16,
            proposals_count=18,
            upwork_url="https://www.upwork.com/jobs/~mock005",
            client=ClientInfoSchema(
                country="United Kingdom",
                payment_verified=True,
                rating=4.7,
                total_spent=42000.0,
                hire_rate=70.0,
                jobs_posted=20,
                member_since=datetime(2020, 9, 5),
            ),
        ),
    ]
