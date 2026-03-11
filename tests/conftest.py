"""Shared test configuration.

Sets safe environment variables and changes CWD to a temp directory
so pydantic-settings does not read the project's .env file (which
contains vars for ALL services, causing extra_forbidden errors).
"""
from __future__ import annotations

import os
import tempfile

# ── Change CWD to temp dir so .env is not found ────────────────────────────
_original_cwd = os.getcwd()
_test_tmpdir = tempfile.mkdtemp(prefix="uphunter_test_")
os.chdir(_test_tmpdir)

# ── Patch env vars BEFORE any service config module is imported ──────────
_ENV_DEFAULTS = {
    "DATABASE_URL": "sqlite+aiosqlite:///test.db",
    "SECRET_KEY": "test-secret-key",
    "REDIS_URL": "redis://localhost:6381/0",
    "KAFKA_BOOTSTRAP_SERVERS": "localhost:9093",
    "KAFKA_ENABLED": "false",
    "OPENAI_API_KEY": "sk-test-fake-key",
    "OPENAI_MODEL": "gpt-4o",
    "OPENAI_TEMP_SCORING": "0.3",
    "OPENAI_TEMP_COVER_LETTER": "0.7",
    "OPENAI_TEMP_TRANSLATION": "0.3",
    "UPWORK_API_URL": "https://api.upwork.com/graphql",
    "UPWORK_CLIENT_ID": "",
    "UPWORK_CLIENT_SECRET": "",
    "UPWORK_REDIRECT_URI": "http://localhost:8000/auth/upwork/callback",
    "UPWORK_AUTH_URL": "https://www.upwork.com/ab/account-security/oauth2/authorize",
    "UPWORK_TOKEN_URL": "https://www.upwork.com/api/v3/oauth2/token",
    "AUTH_SERVICE_URL": "http://auth:8105",
    "CLIENT_INTEL_SERVICE_URL": "http://client-intel:8103",
    "JOBS_SERVICE_URL": "http://jobs:8101",
    "JOBS_POLL_INTERVAL_SECONDS": "300",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "1440",
    "TELEGRAM_BOT_TOKEN": "",
    "TELEGRAM_CHAT_ID": "",
    "TELEGRAM_ENABLED": "false",
    "TELEGRAM_SCORE_THRESHOLD": "70",
    "FRONTEND_URL": "http://localhost:3002",
}

for key, value in _ENV_DEFAULTS.items():
    os.environ[key] = value
