"""Tests for jobs and ai-scoring route ordering: static routes before dynamic."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service


class TestJobsRouteOrdering:
    """Verify jobs service has static routes before /{job_id}."""

    def test_static_routes_before_dynamic(self):
        _routes = import_from_service("jobs", "app.routes")
        paths = [r.path for r in _routes.router.routes]

        static_must_exist = ["/stats/summary", "/settings", "/poller-status", "/filters"]
        dynamic_paths = ["/{job_id}"]

        for sp in static_must_exist:
            if sp in paths:
                sp_idx = paths.index(sp)
                for dp in dynamic_paths:
                    if dp in paths:
                        dp_idx = paths.index(dp)
                        assert sp_idx < dp_idx, (
                            f"{sp} (idx={sp_idx}) must come before {dp} (idx={dp_idx})"
                        )


class TestAiScoringRouteOrdering:
    """Verify ai-scoring has /score-all before /score/{job_id}."""

    def test_score_all_before_score_single(self):
        _routes = import_from_service("ai-scoring", "app.routes")
        paths = [r.path for r in _routes.router.routes]

        if "/score-all" in paths and "/score/{job_id}" in paths:
            assert paths.index("/score-all") < paths.index("/score/{job_id}")


class TestAiScoringScoreAllResponse:
    """Verify ScoreAllResponse schema includes error field."""

    def test_score_all_response_has_error_field(self):
        _routes = import_from_service("ai-scoring", "app.routes")
        resp = _routes.ScoreAllResponse(scored=5, failed=2, job_ids=[1, 2, 3, 4, 5])
        assert resp.error is None

    def test_score_all_response_with_error(self):
        _routes = import_from_service("ai-scoring", "app.routes")
        resp = _routes.ScoreAllResponse(
            scored=0, failed=3, job_ids=[],
            error="Ошибка AI-оценки (OpenAI): insufficient_quota",
        )
        assert "insufficient_quota" in resp.error
