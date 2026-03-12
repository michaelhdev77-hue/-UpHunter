"""Tests for letter-gen route-level changes: translate endpoint, error handling."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service

_routes = import_from_service("letter-gen", "app.routes")

TranslateRequest = _routes.TranslateRequest
LetterConfigSchema = _routes.LetterConfigSchema
LetterConfigUpdate = _routes.LetterConfigUpdate
LetterUpdateRequest = _routes.LetterUpdateRequest


class TestTranslateRequestSchema:
    """Verify TranslateRequest Pydantic model."""

    def test_valid_text(self):
        req = TranslateRequest(text="Hello world")
        assert req.text == "Hello world"

    def test_empty_text(self):
        req = TranslateRequest(text="")
        assert req.text == ""

    def test_missing_text_raises(self):
        with pytest.raises(Exception):
            TranslateRequest()


class TestLetterConfigSchema:
    """Verify LetterConfigSchema defaults."""

    def test_defaults(self):
        cfg = LetterConfigSchema()
        assert cfg.openai_model == "gpt-4o"
        assert cfg.temperature_generation == 0.7
        assert cfg.temperature_translation == 0.3
        assert cfg.max_words == 300


class TestLetterConfigUpdate:
    """Verify LetterConfigUpdate allows partial updates."""

    def test_all_none_by_default(self):
        update = LetterConfigUpdate()
        assert update.openai_model is None
        assert update.temperature_generation is None
        assert update.temperature_translation is None
        assert update.max_words is None

    def test_partial_update(self):
        update = LetterConfigUpdate(max_words=500)
        dumped = update.model_dump(exclude_unset=True)
        assert dumped == {"max_words": 500}


class TestLetterUpdateRequest:
    """Verify LetterUpdateRequest schema."""

    def test_all_optional(self):
        req = LetterUpdateRequest()
        assert req.content_original is None
        assert req.content_ru is None
        assert req.edited_by is None

    def test_with_content(self):
        req = LetterUpdateRequest(content_original="Updated letter", edited_by="user")
        assert req.content_original == "Updated letter"
        assert req.edited_by == "user"


class TestRouteOrderingStaticBeforeDynamic:
    """Verify static routes are registered before dynamic /{param} routes."""

    def test_translate_route_exists(self):
        paths = [r.path for r in _routes.router.routes]
        assert "/translate" in paths

    def test_settings_route_exists(self):
        paths = [r.path for r in _routes.router.routes]
        assert "/settings" in paths

    def test_stats_styles_route_exists(self):
        paths = [r.path for r in _routes.router.routes]
        assert "/stats/styles" in paths

    def test_static_routes_before_dynamic(self):
        """Static routes like /translate, /settings must come before /{job_id}."""
        paths = [r.path for r in _routes.router.routes]
        static_paths = ["/translate", "/settings", "/stats/styles"]
        dynamic_paths = ["/{job_id}", "/{letter_id}"]

        for sp in static_paths:
            if sp in paths:
                sp_idx = paths.index(sp)
                for dp in dynamic_paths:
                    if dp in paths:
                        dp_idx = paths.index(dp)
                        assert sp_idx < dp_idx, (
                            f"Static route {sp} (idx={sp_idx}) must come before "
                            f"dynamic route {dp} (idx={dp_idx})"
                        )
