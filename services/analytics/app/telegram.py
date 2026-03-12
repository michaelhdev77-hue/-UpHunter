"""Telegram notification helpers with inline keyboard for approve/reject."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class TelegramCfg:
    """Lightweight config container for Telegram settings."""
    bot_token: str = ""
    chat_id: str = ""
    enabled: bool = False
    score_threshold: int = 70
    frontend_url: str = "http://localhost:3002"


async def get_telegram_config(db: AsyncSession) -> TelegramCfg:
    """Read TelegramConfig from DB; fall back to env vars if no DB row."""
    from app.models import TelegramConfig

    result = await db.execute(select(TelegramConfig).where(TelegramConfig.id == 1))
    row = result.scalar_one_or_none()
    if row:
        return TelegramCfg(
            bot_token=row.bot_token,
            chat_id=row.chat_id,
            enabled=row.enabled,
            score_threshold=row.score_threshold,
            frontend_url=row.frontend_url,
        )
    # Fallback to environment variables
    return TelegramCfg(
        bot_token=settings.telegram_bot_token,
        chat_id=settings.telegram_chat_id,
        enabled=settings.telegram_enabled,
        score_threshold=settings.telegram_score_threshold,
        frontend_url=settings.frontend_url,
    )


async def send_message(
    text: str,
    reply_markup: dict | None = None,
    *,
    config: TelegramCfg | None = None,
) -> bool:
    """Send a message via Telegram Bot API."""
    if config is None:
        # Legacy fallback — use env vars directly
        bot_token = settings.telegram_bot_token
        chat_id = settings.telegram_chat_id
    else:
        bot_token = config.bot_token
        chat_id = config.chat_id

    if not bot_token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = json.dumps(reply_markup)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code == 200:
            return True
        logger.warning("Telegram API returned %s: %s", resp.status_code, resp.text[:200])
        return False
    except Exception:
        logger.exception("Failed to send Telegram message")
        return False


async def send_scored_notification(
    data: dict,
    config: TelegramCfg | None = None,
) -> None:
    """Send notification about a high-scoring job with action buttons."""
    frontend_url = config.frontend_url if config else settings.frontend_url

    job_id = data.get("job_id", "?")
    title = data.get("title", "Unknown")
    score = data.get("overall_score", 0)
    skills = data.get("skills", [])
    url = data.get("upwork_url", "")

    # Score breakdown
    skill_match = data.get("skill_match", "?")
    budget_fit = data.get("budget_fit", "?")
    win_prob = data.get("win_probability", "?")

    skills_str = ", ".join(skills[:5]) if skills else "—"
    text = (
        f"<b>New high-score job ({score}/100)</b>\n\n"
        f"<b>{title}</b>\n\n"
        f"Skills: {skills_str}\n"
        f"Skill Match: {skill_match} | Budget Fit: {budget_fit} | Win: {win_prob}\n"
    )
    if url:
        text += f'\n<a href="{url}">Open on Upwork</a>'

    # Inline keyboard for quick actions
    inline_keyboard = {
        "inline_keyboard": [
            [
                {"text": "View Details", "url": f"{frontend_url}/jobs/{job_id}"},
            ],
        ],
    }
    if url:
        inline_keyboard["inline_keyboard"].append(
            [{"text": "Open on Upwork", "url": url}]
        )

    await send_message(text, reply_markup=inline_keyboard, config=config)


async def send_letter_notification(
    data: dict,
    config: TelegramCfg | None = None,
) -> None:
    """Send notification when a cover letter is generated and ready for review."""
    frontend_url = config.frontend_url if config else settings.frontend_url

    job_id = data.get("job_id", "?")
    title = data.get("title", "Unknown")
    language = data.get("language", "en")
    version = data.get("version", 1)

    text = (
        f"<b>Cover letter ready for review</b>\n\n"
        f"Job: {title}\n"
        f"Language: {language} | Version: {version}\n"
    )

    inline_keyboard = {
        "inline_keyboard": [
            [
                {"text": "Review & Approve", "url": f"{frontend_url}/jobs/{job_id}"},
            ],
        ],
    }

    await send_message(text, reply_markup=inline_keyboard, config=config)


async def send_status_notification(
    data: dict,
    config: TelegramCfg | None = None,
) -> None:
    """Send notification on important status changes."""
    job_id = data.get("job_id", "?")
    title = data.get("title", "Unknown")
    old_status = data.get("old_status", "?")
    new_status = data.get("new_status", "?")

    # Only notify on important transitions
    important = {"applied", "response", "hired"}
    if new_status not in important:
        return

    emoji = {"applied": "Sent", "response": "Response!", "hired": "HIRED!"}
    label = emoji.get(new_status, new_status)

    text = (
        f"<b>{label}</b>\n\n"
        f"{title}\n"
        f"{old_status} → {new_status}"
    )

    await send_message(text, config=config)
