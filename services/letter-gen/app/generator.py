"""Core cover letter generation module using OpenAI GPT-4o.

Supports:
- Style variants for A/B testing (professional, casual, technical)
- Few-shot examples from approved letters (auto-learn)
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


# Style definitions for A/B testing
STYLE_PROMPTS = {
    "professional": (
        "Style: Professional, structured, confident. Use formal language."
    ),
    "casual": (
        "Style: Conversational, friendly, approachable. "
        "Write like you're talking to a colleague, not a corporate client. "
        "Use shorter sentences and a warm tone."
    ),
    "technical": (
        "Style: Technical, detail-oriented, precise. "
        "Lead with technical competence. Mention specific technologies, "
        "methodologies, and metrics. Less fluff, more substance."
    ),
}


@dataclass
class LetterConfigData:
    """Plain data object holding letter generation config values."""
    openai_model: str = "gpt-4o"
    temperature_generation: float = 0.7
    temperature_translation: float = 0.3
    max_words: int = 300


async def get_letter_config(db: AsyncSession) -> LetterConfigData:
    """Read LetterConfig from DB; return defaults if no row exists."""
    from app.models import LetterConfig

    result = await db.execute(select(LetterConfig).where(LetterConfig.id == 1))
    row = result.scalar_one_or_none()
    if not row:
        return LetterConfigData()
    return LetterConfigData(
        openai_model=row.openai_model,
        temperature_generation=row.temperature_generation,
        temperature_translation=row.temperature_translation,
        max_words=row.max_words,
    )


async def generate_cover_letter(
    job: dict,
    team_profile: dict,
    language: str = "en",
    style: str = "professional",
    extra_instructions: str | None = None,
    approved_examples: list[str] | None = None,
    config: LetterConfigData | None = None,
) -> str:
    """Generate a personalised cover letter for an Upwork job using OpenAI.

    Args:
        job: Job details dict (title, description, skills, budget, duration).
        team_profile: Team profile dict (skills, portfolio).
        language: Target language code for the letter.
        style: Letter style for A/B testing (professional/casual/technical).
        extra_instructions: Optional additional instructions (for regeneration).
        approved_examples: Previously approved letters to learn from.

    Returns:
        Generated cover letter text.
    """
    title = job.get("title", "N/A")
    description = job.get("description", "N/A")
    skills = ", ".join(job.get("skills", [])) if isinstance(job.get("skills"), list) else job.get("skills", "N/A")
    budget = job.get("budget", "N/A")
    duration = job.get("duration", "N/A")

    team_skills = ", ".join(team_profile.get("skills", [])) if isinstance(team_profile.get("skills"), list) else team_profile.get("skills", "N/A")
    team_portfolio = team_profile.get("portfolio", "N/A")
    if isinstance(team_portfolio, list):
        team_portfolio = "\n".join(f"- {p}" for p in team_portfolio)

    if config is None:
        config = LetterConfigData()

    style_prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS["professional"])

    # Build few-shot examples section
    examples_section = ""
    if approved_examples:
        examples_section = "\n\n=== EXAMPLES OF APPROVED LETTERS (learn from this style) ===\n"
        for i, ex in enumerate(approved_examples[:3], 1):
            # Truncate long examples
            truncated = ex[:500] + "..." if len(ex) > 500 else ex
            examples_section += f"\nExample {i}:\n{truncated}\n"
        examples_section += "\nAdapt this team's voice and approach to the new job.\n"

    prompt = f"""You are an experienced freelancer writing a cover letter for an Upwork job.

{style_prompt}
Structure:
1. Hook — mention the client's specific problem from their job description
2. Relevant experience — 1-2 similar projects from the portfolio
3. Plan of action — concrete work plan for this project
4. Clarifying question — shows engagement
5. Call to action — suggest a quick call

Job title: {title}
Job description: {description}
Required skills: {skills}
Budget: {budget}
Duration: {duration}

Team skills: {team_skills}
Team portfolio: {team_portfolio}
{examples_section}
Write the cover letter in {language}. Keep it under {config.max_words} words.
Do NOT use generic phrases like "I am excited" or "I came across your posting"."""

    if extra_instructions:
        prompt += f"\n\nAdditional instructions: {extra_instructions}"

    client = _get_client()
    response = await client.chat.completions.create(
        model=config.openai_model,
        temperature=config.temperature_generation,
        messages=[
            {"role": "system", "content": "You write concise, high-converting Upwork cover letters."},
            {"role": "user", "content": prompt},
        ],
    )
    text = response.choices[0].message.content.strip()
    logger.info("Cover letter generated (%d chars, lang=%s, style=%s)", len(text), language, style)
    return text


async def translate_to_russian(text: str, config: LetterConfigData | None = None) -> str:
    """Translate text to Russian using OpenAI."""
    if config is None:
        config = LetterConfigData()
    client = _get_client()
    response = await client.chat.completions.create(
        model=config.openai_model,
        temperature=config.temperature_translation,
        messages=[
            {
                "role": "system",
                "content": (
                    "Translate the following text to Russian. "
                    "Keep the formatting, technical terms can stay in English. "
                    "Return ONLY the translation, nothing else."
                ),
            },
            {"role": "user", "content": text},
        ],
    )
    translated = response.choices[0].message.content.strip()
    logger.info("Translation to Russian complete (%d chars)", len(translated))
    return translated


def detect_language(text: str) -> str:
    """Detect the primary language of *text* using simple heuristics."""
    if not text:
        return "en"
    if re.search(r"[\u0400-\u04FF]", text):
        return "ru"
    if re.search(r"[\u4E00-\u9FFF]", text):
        return "zh"
    if re.search(r"[\u3040-\u309F\u30A0-\u30FF]", text):
        return "ja"
    if re.search(r"[\uAC00-\uD7AF]", text):
        return "ko"
    if re.search(r"[\u0600-\u06FF]", text):
        return "ar"
    if re.search(r"[äöüßÄÖÜ]", text):
        return "de"
    if re.search(r"[àâçéèêëîïôùûüÿœæ]", text, re.IGNORECASE):
        return "fr"
    if re.search(r"[ñ¿¡]", text, re.IGNORECASE):
        return "es"
    if re.search(r"[ãõçâê]", text, re.IGNORECASE):
        return "pt"
    return "en"
