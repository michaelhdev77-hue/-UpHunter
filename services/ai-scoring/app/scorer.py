"""Core AI scoring module — evaluates jobs using OpenAI GPT."""
from __future__ import annotations

import json
import logging

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


async def get_scoring_config(db: AsyncSession) -> dict:
    """Read ScoringConfig from DB, return defaults if not found."""
    from app.models import ScoringConfig

    result = await db.execute(select(ScoringConfig).where(ScoringConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        return {
            "openai_model": settings.openai_model,
            "openai_temperature": settings.openai_temp_scoring,
            "weight_skill_match": 0.35,
            "weight_budget_fit": 0.20,
            "weight_scope_clarity": 0.15,
            "weight_win_probability": 0.30,
        }
    return {
        "openai_model": config.openai_model,
        "openai_temperature": config.openai_temperature,
        "weight_skill_match": config.weight_skill_match,
        "weight_budget_fit": config.weight_budget_fit,
        "weight_scope_clarity": config.weight_scope_clarity,
        "weight_win_probability": config.weight_win_probability,
    }


def _build_prompt(job_data: dict, client_data: dict, team_profile: dict, config: dict | None = None) -> str:
    """Build the scoring prompt from job, client, and team data."""
    if config is None:
        config = {}
    w_sm = int(config.get("weight_skill_match", 0.35) * 100)
    w_bf = int(config.get("weight_budget_fit", 0.20) * 100)
    w_sc = int(config.get("weight_scope_clarity", 0.15) * 100)
    w_wp = int(config.get("weight_win_probability", 0.30) * 100)
    return f"""You are an expert freelance business analyst. Evaluate the following Upwork job posting
against the freelancer team's profile and return a JSON scoring object.

=== JOB POSTING ===
Title: {job_data.get("title", "N/A")}
Description: {job_data.get("description", "N/A")}
Skills required: {", ".join(job_data.get("skills", [])) or "N/A"}
Budget min: {job_data.get("budget_min") or job_data.get("hourly_rate_min") or "N/A"}
Budget max: {job_data.get("budget_max") or job_data.get("hourly_rate_max") or "N/A"}
Contract type: {job_data.get("contract_type", "N/A")}
Duration: {job_data.get("duration", "N/A")}
Experience level: {job_data.get("experience_level", "N/A")}
Proposals count: {job_data.get("proposals_count", "N/A")}

=== CLIENT METRICS ===
Rating: {client_data.get("rating", "N/A")}
Total spent: ${client_data.get("total_spent", "N/A")}
Hire rate: {client_data.get("hire_rate", "N/A")}%
Payment verified: {client_data.get("payment_verified", "N/A")}
Jobs posted: {client_data.get("jobs_posted", "N/A")}
Country: {client_data.get("country", "N/A")}

=== TEAM PROFILE ===
Skills: {team_profile.get("skills_description", "N/A")}
Portfolio: {team_profile.get("portfolio_description", "N/A")}
Hourly rate range: ${team_profile.get("hourly_rate_min", "N/A")} - ${team_profile.get("hourly_rate_max", "N/A")}

=== INSTRUCTIONS ===
Return a JSON object with EXACTLY these fields:
- "skill_match": integer 0-100, how well the team's skills match the job requirements
- "budget_fit": integer 0-100, how well the job budget aligns with the team's rates
- "scope_clarity": integer 0-100, how clearly defined is the project scope and requirements
- "win_probability": integer 0-100, estimated probability of winning this job considering competition
- "overall_score": integer 0-100, weighted average (skill_match {w_sm}%, budget_fit {w_bf}%, scope_clarity {w_sc}%, win_probability {w_wp}%)
- "reasoning": string, 2-4 sentences IN RUSSIAN explaining the key factors behind your scores

Be realistic and critical. Low-quality clients or vague descriptions should lower scores significantly.
IMPORTANT: The "reasoning" field MUST be written in Russian language."""


async def score_job(
    job_data: dict,
    client_data: dict,
    team_profile: dict,
    config: dict | None = None,
) -> dict | None:
    """Score a job posting against team profile using OpenAI.

    Returns dict with scoring fields or None on failure.
    """
    if config is None:
        config = {}
    model = config.get("openai_model", settings.openai_model)
    temperature = config.get("openai_temperature", settings.openai_temp_scoring)

    try:
        client = _get_client()
        prompt = _build_prompt(job_data, client_data, team_profile, config)

        response = await client.chat.completions.create(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You are a freelance job scoring assistant. Always respond with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
        )

        raw = response.choices[0].message.content
        data = json.loads(raw)

        # Validate and clamp scores to 0-100
        scores = {}
        for key in ("skill_match", "budget_fit", "scope_clarity", "win_probability", "overall_score"):
            val = data.get(key)
            if val is None:
                logger.warning("Missing key %s in LLM response, defaulting to 0", key)
                val = 0
            scores[key] = max(0.0, min(100.0, float(val)))

        scores["reasoning"] = str(data.get("reasoning", ""))

        logger.info(
            "Scored job: overall=%.1f skill=%.1f budget=%.1f scope=%.1f win=%.1f",
            scores["overall_score"],
            scores["skill_match"],
            scores["budget_fit"],
            scores["scope_clarity"],
            scores["win_probability"],
        )
        return scores

    except Exception as exc:
        logger.exception("Failed to score job via OpenAI")
        raise RuntimeError(f"Ошибка AI-оценки (OpenAI): {exc}") from exc
