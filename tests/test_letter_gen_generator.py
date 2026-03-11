"""Unit tests for letter-gen/app/generator.py — language detection and config."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service

_gen = import_from_service("letter-gen", "app.generator")

detect_language = _gen.detect_language
STYLE_PROMPTS = _gen.STYLE_PROMPTS
LetterConfigData = _gen.LetterConfigData


# ── detect_language ─────────────────────────────────────────────────────────


class TestDetectLanguage:
    def test_empty_string(self):
        assert detect_language("") == "en"

    def test_english(self):
        assert detect_language("Hello, world! This is an English text.") == "en"

    def test_russian(self):
        assert detect_language("Привет, мир! Это русский текст.") == "ru"

    def test_chinese(self):
        assert detect_language("你好世界") == "zh"

    def test_japanese(self):
        # Use pure hiragana/katakana without CJK chars that match zh first
        assert detect_language("こんにちは") == "ja"

    def test_korean(self):
        assert detect_language("안녕하세요") == "ko"

    def test_arabic(self):
        assert detect_language("مرحبا بالعالم") == "ar"

    def test_german(self):
        assert detect_language("Wir brauchen einen Entwickler für unser Büro") == "de"

    def test_french(self):
        assert detect_language("Nous cherchons un développeur expérimenté") == "fr"

    def test_spanish(self):
        assert detect_language("¿Necesitamos un desarrollador para nuestro proyecto?") == "es"

    def test_portuguese(self):
        # Use ã which is uniquely Portuguese (ç also matches French pattern)
        assert detect_language("Não precisamos de nenhum") == "pt"

    def test_mixed_english_with_code(self):
        text = "We need a developer who knows React, TypeScript, and Node.js"
        assert detect_language(text) == "en"

    def test_russian_with_english_terms(self):
        text = "Нам нужен разработчик React и TypeScript"
        assert detect_language(text) == "ru"


# ── STYLE_PROMPTS ──────────────────────────────────────────────────────────


class TestStylePrompts:
    def test_all_styles_exist(self):
        assert "professional" in STYLE_PROMPTS
        assert "casual" in STYLE_PROMPTS
        assert "technical" in STYLE_PROMPTS

    def test_styles_are_non_empty(self):
        for style, prompt in STYLE_PROMPTS.items():
            assert len(prompt) > 10, f"Style {style!r} has too short prompt"


# ── LetterConfigData ───────────────────────────────────────────────────────


class TestLetterConfigData:
    def test_defaults(self):
        cfg = LetterConfigData()
        assert cfg.openai_model == "gpt-4o"
        assert cfg.temperature_generation == 0.7
        assert cfg.temperature_translation == 0.3
        assert cfg.max_words == 300

    def test_custom_values(self):
        cfg = LetterConfigData(
            openai_model="gpt-4o-mini",
            temperature_generation=0.9,
            temperature_translation=0.1,
            max_words=500,
        )
        assert cfg.openai_model == "gpt-4o-mini"
        assert cfg.max_words == 500
