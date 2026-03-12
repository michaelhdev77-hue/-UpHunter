"""Tests for jobs model changes: detected_language as Optional, filter fields."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service

_models = import_from_service("jobs", "app.models")

JobCreateSchema = _models.JobCreateSchema
JobResponseSchema = _models.JobResponseSchema
SearchFilterCreate = _models.SearchFilterCreate


class TestDetectedLanguageOptional:
    """Verify detected_language accepts None (was required str before fix)."""

    def test_default_is_en(self):
        job = JobCreateSchema(upwork_id="test", title="T", description="D")
        assert job.detected_language == "en"

    def test_none_accepted_in_create(self):
        job = JobCreateSchema(
            upwork_id="test", title="T", description="D",
            detected_language=None,
        )
        assert job.detected_language is None

    def test_none_accepted_in_response(self):
        resp = JobResponseSchema(
            id=1, upwork_id="test", title="T", description="D",
            skills=[], status=_models.JobStatus.discovered,
            detected_language=None,
        )
        assert resp.detected_language is None

    def test_response_with_explicit_language(self):
        resp = JobResponseSchema(
            id=1, upwork_id="test", title="T", description="D",
            skills=[], status=_models.JobStatus.discovered,
            detected_language="ru",
        )
        assert resp.detected_language == "ru"


class TestSearchFilterFields:
    """Verify SearchFilterCreate has budget and experience fields for Upwork API filtering."""

    def test_minimal_filter(self):
        f = SearchFilterCreate(name="Test filter")
        assert f.name == "Test filter"
        assert f.keywords is None or f.keywords == [] or f.keywords is None

    def test_filter_with_budget(self):
        f = SearchFilterCreate(
            name="Budget filter",
            budget_min=1000,
            budget_max=5000,
        )
        assert f.budget_min == 1000
        assert f.budget_max == 5000

    def test_filter_with_experience(self):
        f = SearchFilterCreate(
            name="Expert filter",
            experience_level=_models.ExperienceLevel.expert,
        )
        assert f.experience_level == _models.ExperienceLevel.expert
