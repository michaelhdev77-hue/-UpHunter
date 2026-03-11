"""Unit tests for Pydantic schemas across all services."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service


# ── Jobs schemas ───────────────────────────────────────────────────────────


class TestJobsSchemas:
    def _models(self):
        return import_from_service("jobs", "app.models")

    def test_job_create_minimal(self):
        m = self._models()
        job = m.JobCreateSchema(upwork_id="abc", title="Test", description="Desc")
        assert job.skills == []
        assert job.detected_language == "en"

    def test_job_create_with_skills(self):
        m = self._models()
        job = m.JobCreateSchema(
            upwork_id="x", title="T", description="D",
            skills=["Python", "React"],
        )
        assert len(job.skills) == 2

    def test_client_info_defaults(self):
        m = self._models()
        client = m.ClientInfoSchema()
        assert client.country is None
        assert client.payment_verified is None

    def test_status_update_schema(self):
        m = self._models()
        update = m.StatusUpdateSchema(status=m.JobStatus.scored)
        assert update.status == m.JobStatus.scored

    def test_search_filter_create(self):
        m = self._models()
        f = m.SearchFilterCreate(name="Python jobs", keywords=["python", "fastapi"])
        assert f.name == "Python jobs"
        assert len(f.keywords) == 2


# ── Client-intel schemas ──────────────────────────────────────────────────


class TestClientIntelSchemas:
    def test_client_response(self):
        m = import_from_service("client-intel", "app.models")
        resp = m.ClientResponse(
            id=1, upwork_uid="test-uid",
            payment_verified=True, total_spent=1000.0,
        )
        assert resp.risk_score is None
        assert resp.red_flags == []


# ── Letter-gen schemas ────────────────────────────────────────────────────


class TestLetterGenSchemas:
    def _models(self):
        return import_from_service("letter-gen", "app.models")

    def test_cover_letter_response(self):
        m = self._models()
        resp = m.CoverLetterResponse(
            id=1, job_id=10, content_original="Dear client..."
        )
        assert resp.version == 1
        assert resp.status == m.LetterStatus.draft
        assert resp.style == "professional"

    def test_generate_request(self):
        m = self._models()
        req = m.GenerateRequest(job_id=5)
        assert req.style is None

    def test_regenerate_request(self):
        m = self._models()
        req = m.RegenerateRequest(instructions="Make it shorter")
        assert req.style is None


# ── Analytics schemas ─────────────────────────────────────────────────────


class TestAnalyticsSchemas:
    def _models(self):
        return import_from_service("analytics", "app.models")

    def test_funnel_event_create(self):
        m = self._models()
        event = m.FunnelEventCreate(job_id=1, stage="discovered")
        assert event.metadata is None

    def test_funnel_stats(self):
        m = self._models()
        stats = m.FunnelStats(
            stages=[m.FunnelStageCount(stage="discovered", count=10)],
            total_events=10,
        )
        assert len(stats.stages) == 1
