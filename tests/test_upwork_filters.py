"""Tests for upwork_client filter parameter support."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests._import_helper import import_from_service

_uc = import_from_service("jobs", "app.upwork_client")

UpworkGraphQLClient = _uc.UpworkGraphQLClient


class TestSearchJobsFilterParams:
    """Verify search_jobs accepts and uses all filter parameters."""

    def test_search_jobs_signature_has_all_filters(self):
        """search_jobs must accept category, contract_type, experience_level, budget_min, budget_max."""
        import inspect
        sig = inspect.signature(UpworkGraphQLClient.search_jobs)
        params = list(sig.parameters.keys())
        assert "keywords" in params
        assert "skills" in params
        assert "category" in params
        assert "contract_type" in params
        assert "experience_level" in params
        assert "budget_min" in params
        assert "budget_max" in params
        assert "limit" in params

    @pytest.mark.asyncio
    async def test_search_jobs_with_no_token_returns_mock(self):
        """Without access token, search_jobs should return mock data."""
        client = UpworkGraphQLClient(access_token=None)
        jobs = await client.search_jobs(keywords=["python"], limit=5)
        assert isinstance(jobs, list)
        assert len(jobs) > 0

    @pytest.mark.asyncio
    async def test_search_jobs_with_all_filters_mock(self):
        """Ensure all filter params are accepted without error in mock mode."""
        client = UpworkGraphQLClient(access_token=None)
        jobs = await client.search_jobs(
            keywords=["react"],
            skills=["React", "TypeScript"],
            category="Web Development",
            contract_type="fixed",
            experience_level="expert",
            budget_min=1000,
            budget_max=5000,
            limit=3,
        )
        assert isinstance(jobs, list)
