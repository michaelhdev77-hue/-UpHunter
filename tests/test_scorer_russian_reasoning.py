"""Tests for ai-scoring changes: Russian reasoning prompt and RuntimeError on failure."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests._import_helper import import_from_service

_scorer = import_from_service("ai-scoring", "app.scorer")
_build_prompt = _scorer._build_prompt
score_job = _scorer.score_job


class TestRussianReasoningPrompt:
    """Verify that the scoring prompt requests reasoning in Russian."""

    def _defaults(self):
        job = {"title": "Dev", "description": "Build API", "skills": ["Python"]}
        client = {"rating": 4.5, "total_spent": 50000}
        team = {"skills_description": "Python", "hourly_rate_min": 40, "hourly_rate_max": 80}
        return job, client, team

    def test_prompt_requests_russian_reasoning(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert "IN RUSSIAN" in prompt

    def test_prompt_has_russian_language_instruction(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert "Russian language" in prompt

    def test_prompt_reasoning_field_mentioned(self):
        job, client, team = self._defaults()
        prompt = _build_prompt(job, client, team)
        assert '"reasoning"' in prompt


class TestScoreJobRaisesOnFailure:
    """Verify score_job raises RuntimeError instead of returning None."""

    @pytest.mark.asyncio
    async def test_raises_runtime_error_on_openai_failure(self):
        with patch.object(_scorer, "_get_client") as mock_client:
            client_mock = MagicMock()
            client_mock.chat.completions.create = AsyncMock(
                side_effect=Exception("API quota exceeded")
            )
            mock_client.return_value = client_mock

            with pytest.raises(RuntimeError, match="Ошибка AI-оценки"):
                await score_job(
                    {"title": "Test"},
                    {"rating": 4.0},
                    {"skills_description": "Python"},
                )

    @pytest.mark.asyncio
    async def test_error_message_contains_original_error(self):
        with patch.object(_scorer, "_get_client") as mock_client:
            client_mock = MagicMock()
            client_mock.chat.completions.create = AsyncMock(
                side_effect=Exception("insufficient_quota")
            )
            mock_client.return_value = client_mock

            with pytest.raises(RuntimeError, match="insufficient_quota"):
                await score_job({}, {}, {})
