"""Unit tests for analytics/app/telegram.py — config and notification filtering."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service

_tg = import_from_service("analytics", "app.telegram")

TelegramCfg = _tg.TelegramCfg
send_status_notification = _tg.send_status_notification
send_message = _tg.send_message


# ── TelegramCfg ────────────────────────────────────────────────────────────


class TestTelegramCfg:
    def test_defaults(self):
        cfg = TelegramCfg()
        assert cfg.bot_token == ""
        assert cfg.chat_id == ""
        assert cfg.enabled is False
        assert cfg.score_threshold == 70
        assert cfg.frontend_url == "http://localhost:3002"

    def test_custom_values(self):
        cfg = TelegramCfg(
            bot_token="123:ABC",
            chat_id="-100123",
            enabled=True,
            score_threshold=50,
            frontend_url="https://app.example.com",
        )
        assert cfg.enabled is True
        assert cfg.score_threshold == 50


# ── send_message with missing credentials ──────────────────────────────────


class TestSendMessage:
    @pytest.mark.asyncio
    async def test_returns_false_when_no_token(self):
        cfg = TelegramCfg(bot_token="", chat_id="123")
        result = await send_message("test", config=cfg)
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_no_chat_id(self):
        cfg = TelegramCfg(bot_token="123:ABC", chat_id="")
        result = await send_message("test", config=cfg)
        assert result is False


# ── send_status_notification filtering ─────────────────────────────────────


class TestStatusNotificationFiltering:
    @pytest.mark.asyncio
    async def test_non_important_status_is_silent(self):
        cfg = TelegramCfg(bot_token="123:ABC", chat_id="-100", enabled=True)
        # "scored" is not important — function should return without sending
        await send_status_notification(
            {"job_id": 1, "title": "Test", "old_status": "discovered", "new_status": "scored"},
            config=cfg,
        )

    @pytest.mark.asyncio
    async def test_important_statuses_handled(self):
        # With empty credentials, send_message returns False, but no exception
        cfg = TelegramCfg(bot_token="", chat_id="", enabled=True)
        for status in ("applied", "response", "hired"):
            await send_status_notification(
                {"job_id": 1, "title": "T", "old_status": "x", "new_status": status},
                config=cfg,
            )
