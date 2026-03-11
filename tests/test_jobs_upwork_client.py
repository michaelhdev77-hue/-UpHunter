"""Unit tests for jobs/app/upwork_client.py — GraphQL parsing and mock data."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service

_uc = import_from_service("jobs", "app.upwork_client")

_parse_tier = _uc._parse_tier
_parse_job_node = _uc._parse_job_node
_get_mock_jobs = _uc._get_mock_jobs
# Use JobCreateSchema from the same module scope to avoid isinstance mismatch
JobCreateSchema = _uc.JobCreateSchema


# ── _parse_tier ──────────────────────────────────────────────────────────────


class TestParseTier:
    def test_entry(self):
        assert _parse_tier("ENTRY") == "entry"

    def test_intermediate(self):
        assert _parse_tier("INTERMEDIATE") == "intermediate"

    def test_expert(self):
        assert _parse_tier("EXPERT") == "expert"

    def test_none(self):
        assert _parse_tier(None) is None

    def test_empty_string(self):
        assert _parse_tier("") is None

    def test_unknown_tier(self):
        assert _parse_tier("UNKNOWN") is None


# ── _parse_job_node ─────────────────────────────────────────────────────────


class TestParseJobNode:
    def _minimal_node(self, **overrides) -> dict:
        base = {
            "id": "job-123",
            "title": "Test Job",
            "description": "A test job",
            "ciphertext": "abc123",
        }
        base.update(overrides)
        return base

    def test_minimal_node(self):
        result = _parse_job_node(self._minimal_node())
        assert isinstance(result, JobCreateSchema)
        assert result.upwork_id == "job-123"
        assert result.title == "Test Job"
        assert result.upwork_url == "https://www.upwork.com/jobs/abc123"

    def test_fixed_contract_when_budget_present(self):
        node = self._minimal_node(amount={"amount": 5000, "currencyCode": "USD"})
        result = _parse_job_node(node)
        assert result.contract_type == "fixed"
        assert result.budget_min == 5000
        assert result.budget_max == 5000

    def test_hourly_contract_when_no_budget(self):
        node = self._minimal_node(
            hourlyBudgetMin={"amount": 30},
            hourlyBudgetMax={"amount": 60},
        )
        result = _parse_job_node(node)
        assert result.contract_type == "hourly"
        assert result.hourly_rate_min == 30
        assert result.hourly_rate_max == 60

    def test_skills_parsing(self):
        node = self._minimal_node(
            skills=[
                {"name": "python", "prettyName": "Python"},
                {"name": "fastapi", "prettyName": "FastAPI"},
            ]
        )
        result = _parse_job_node(node)
        assert result.skills == ["Python", "FastAPI"]

    def test_skills_fallback_to_name(self):
        node = self._minimal_node(
            skills=[{"name": "react", "prettyName": None}]
        )
        result = _parse_job_node(node)
        assert result.skills == ["react"]

    def test_client_data_full(self):
        node = self._minimal_node(
            client={
                "location": {"country": "United States", "city": "New York"},
                "paymentVerificationStatus": "VERIFIED",
                "rating": {"overallScore": 4.8},
                "totalSpent": {"amount": 50000},
                "totalPostedJobs": 20,
                "totalHires": 15,
                "totalReviews": 10,
                "memberSince": "2020-01-15T00:00:00Z",
            }
        )
        result = _parse_job_node(node)
        assert result.client is not None
        assert result.client.country == "United States"
        assert result.client.payment_verified is True
        assert result.client.rating == 4.8
        assert result.client.total_spent == 50000
        assert result.client.hire_rate == 75.0

    def test_client_hire_rate_zero_posted(self):
        node = self._minimal_node(
            client={"totalHires": 0, "totalPostedJobs": 0}
        )
        result = _parse_job_node(node)
        assert result.client.hire_rate is None

    def test_client_unverified_payment(self):
        node = self._minimal_node(
            client={"paymentVerificationStatus": "NOT_VERIFIED"}
        )
        result = _parse_job_node(node)
        assert result.client.payment_verified is False

    def test_client_missing(self):
        node = self._minimal_node(client=None)
        result = _parse_job_node(node)
        assert result.client is not None
        assert result.client.payment_verified is False

    def test_empty_ciphertext(self):
        node = self._minimal_node(ciphertext="")
        result = _parse_job_node(node)
        assert result.upwork_url is None

    def test_member_since_invalid_date(self):
        node = self._minimal_node(client={"memberSince": "not-a-date"})
        result = _parse_job_node(node)
        assert result.client.member_since is None

    def test_experience_level_mapping(self):
        node = self._minimal_node(contractorTier="EXPERT")
        result = _parse_job_node(node)
        assert result.experience_level == "expert"

    def test_category_and_subcategory(self):
        node = self._minimal_node(
            category={"name": "Web Development"},
            subcategory={"name": "Full-Stack"},
        )
        result = _parse_job_node(node)
        assert result.category == "Web Development"
        assert result.subcategory == "Full-Stack"

    def test_duration_and_engagement(self):
        node = self._minimal_node(
            duration="3-6 months",
            durationLabel="3 to 6 months",
            engagement="30+ hrs/week",
        )
        result = _parse_job_node(node)
        assert result.duration == "3-6 months"
        assert result.duration_label == "3 to 6 months"
        assert result.engagement == "30+ hrs/week"


# ── _get_mock_jobs ──────────────────────────────────────────────────────────


class TestMockJobs:
    def test_returns_list(self):
        jobs = _get_mock_jobs()
        assert isinstance(jobs, list)
        assert len(jobs) == 5

    def test_all_valid_schemas(self):
        for job in _get_mock_jobs():
            assert isinstance(job, JobCreateSchema)
            assert job.upwork_id.startswith("mock-")
            assert len(job.title) > 0

    def test_mock_jobs_have_clients(self):
        for job in _get_mock_jobs():
            assert job.client is not None
            assert job.client.country is not None

    def test_variety_of_contract_types(self):
        jobs = _get_mock_jobs()
        types = {j.contract_type for j in jobs}
        assert "hourly" in types
        assert "fixed" in types
