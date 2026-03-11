"""Unit tests for ai-scoring/app/scorer.py — prompt building."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service

_scorer = import_from_service("ai-scoring", "app.scorer")
_build_prompt = _scorer._build_prompt


class TestBuildPrompt:
    def _defaults(self):
        job = {
            "title": "Python Developer",
            "description": "Build a REST API",
            "skills": ["Python", "FastAPI"],
            "budget_min": 2000,
            "budget_max": 5000,
            "contract_type": "fixed",
            "duration": "1-3 months",
            "experience_level": "expert",
            "proposals_count": 10,
        }
        client = {
            "rating": 4.5,
            "total_spent": 50000,
            "hire_rate": 80,
            "payment_verified": True,
            "jobs_posted": 20,
            "country": "United States",
        }
        team = {
            "skills_description": "Python, FastAPI, Django",
            "portfolio_description": "SaaS platforms",
            "hourly_rate_min": 40,
            "hourly_rate_max": 80,
        }
        return job, client, team

    def test_contains_job_title(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert "Python Developer" in prompt

    def test_contains_skills(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert "Python, FastAPI" in prompt

    def test_contains_client_metrics(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert "$50000" in prompt
        assert "80%" in prompt

    def test_contains_team_profile(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert "Python, FastAPI, Django" in prompt
        assert "$40" in prompt
        assert "$80" in prompt

    def test_custom_weights(self):
        job, client, team = self._defaults()
        config = {
            "weight_skill_match": 0.40,
            "weight_budget_fit": 0.25,
            "weight_scope_clarity": 0.10,
            "weight_win_probability": 0.25,
        }
        prompt = _build_prompt(job, client, team, config)
        assert "skill_match 40%" in prompt
        assert "budget_fit 25%" in prompt
        assert "scope_clarity 10%" in prompt
        assert "win_probability 25%" in prompt

    def test_default_weights(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert "skill_match 35%" in prompt
        assert "budget_fit 20%" in prompt
        assert "scope_clarity 15%" in prompt
        assert "win_probability 30%" in prompt

    def test_missing_job_fields_use_na(self):
        prompt = _build_prompt({}, {}, {})
        assert "N/A" in prompt

    def test_hourly_rate_fallback(self):
        job = {"hourly_rate_min": 30, "hourly_rate_max": 60}
        prompt = _build_prompt(job, {}, {})
        assert "30" in prompt
        assert "60" in prompt

    def test_empty_skills_list(self):
        job = {"skills": []}
        prompt = _build_prompt(job, {}, {})
        assert "Skills required: N/A" in prompt

    def test_json_format_instructions(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert '"skill_match"' in prompt
        assert '"budget_fit"' in prompt
        assert '"overall_score"' in prompt
        assert '"reasoning"' in prompt
