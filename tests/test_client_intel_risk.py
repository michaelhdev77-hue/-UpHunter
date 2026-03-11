"""Unit tests for client-intel risk scoring functions."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from tests._import_helper import import_from_service

_routes = import_from_service("client-intel", "app.routes")

_clamp = _routes._clamp
normalize_inverse = _routes.normalize_inverse
age_penalty = _routes.age_penalty
location_risk = _routes.location_risk
compute_risk_score = _routes.compute_risk_score
detect_red_flags = _routes.detect_red_flags
_RiskWeights = _routes._RiskWeights
HIGH_RISK_COUNTRIES = _routes.HIGH_RISK_COUNTRIES
MEDIUM_RISK_COUNTRIES = _routes.MEDIUM_RISK_COUNTRIES
LOW_RISK_COUNTRIES = _routes.LOW_RISK_COUNTRIES


# ── _clamp ──────────────────────────────────────────────────────────────────


class TestClamp:
    def test_within_range(self):
        assert _clamp(5.0, 0.0, 10.0) == 5.0

    def test_below_min(self):
        assert _clamp(-1.0, 0.0, 10.0) == 0.0

    def test_above_max(self):
        assert _clamp(15.0, 0.0, 10.0) == 10.0

    def test_at_boundaries(self):
        assert _clamp(0.0, 0.0, 10.0) == 0.0
        assert _clamp(10.0, 0.0, 10.0) == 10.0


# ── normalize_inverse ──────────────────────────────────────────────────────


class TestNormalizeInverse:
    def test_none_returns_max_risk(self):
        assert normalize_inverse(None, 0, 100) == 1.0

    def test_zero_span(self):
        assert normalize_inverse(5.0, 5.0, 5.0) == 0.0

    def test_max_value_returns_zero(self):
        assert normalize_inverse(100_000, 0, 100_000) == 0.0

    def test_zero_value_returns_one(self):
        assert normalize_inverse(0, 0, 100_000) == 1.0

    def test_midpoint(self):
        result = normalize_inverse(50_000, 0, 100_000)
        assert abs(result - 0.5) < 0.01

    def test_below_lo(self):
        assert normalize_inverse(-10, 0, 100) == 1.0

    def test_above_hi(self):
        assert normalize_inverse(200, 0, 100) == 0.0


# ── age_penalty ─────────────────────────────────────────────────────────────


class TestAgePenalty:
    def test_none_returns_max_penalty(self):
        assert age_penalty(None) == 1.0

    def test_very_new_account(self):
        recent = datetime.now(timezone.utc) - timedelta(days=10)
        assert age_penalty(recent) == 1.0

    def test_account_3_months(self):
        dt = datetime.now(timezone.utc) - timedelta(days=90)
        assert age_penalty(dt) == 0.5

    def test_account_9_months(self):
        dt = datetime.now(timezone.utc) - timedelta(days=270)
        assert age_penalty(dt) == 0.2

    def test_old_account(self):
        dt = datetime.now(timezone.utc) - timedelta(days=500)
        assert age_penalty(dt) == 0.0

    def test_naive_datetime_handled(self):
        dt = datetime.now() - timedelta(days=500)
        assert age_penalty(dt) == 0.0


# ── location_risk ──────────────────────────────────────────────────────────


class TestLocationRisk:
    def test_none_country(self):
        assert location_risk(None) == 0.5

    def test_empty_string(self):
        assert location_risk("") == 0.5

    def test_high_risk(self):
        assert location_risk("Nigeria") == 0.8
        assert location_risk("PAKISTAN") == 0.8

    def test_medium_risk(self):
        assert location_risk("India") == 0.3
        assert location_risk("  Philippines  ") == 0.3

    def test_low_risk(self):
        assert location_risk("United States") == 0.0
        assert location_risk("germany") == 0.0

    def test_unlisted_country(self):
        assert location_risk("Brazil") == 0.2

    def test_country_sets_are_lowercase(self):
        for s in (HIGH_RISK_COUNTRIES, MEDIUM_RISK_COUNTRIES, LOW_RISK_COUNTRIES):
            for c in s:
                assert c == c.lower(), f"{c!r} is not lowercase"


# ── compute_risk_score ─────────────────────────────────────────────────────


class TestComputeRiskScore:
    def test_ideal_client_low_risk(self):
        score = compute_risk_score(
            payment_verified=True,
            total_spent=100_000,
            hire_rate=90.0,
            rating=5.0,
            reviews_count=50,
            member_since=datetime.now(timezone.utc) - timedelta(days=2000),
            country="United States",
        )
        assert score < 10, f"Expected <10 for ideal client, got {score}"

    def test_worst_client_high_risk(self):
        score = compute_risk_score(
            payment_verified=False,
            total_spent=0.0,
            hire_rate=0.0,
            rating=0.0,
            reviews_count=0,
            member_since=datetime.now(timezone.utc) - timedelta(days=5),
            country="Nigeria",
        )
        assert score > 80, f"Expected >80 for risky client, got {score}"

    def test_all_none_values(self):
        score = compute_risk_score(
            payment_verified=False,
            total_spent=None,
            hire_rate=None,
            rating=None,
            reviews_count=None,
            member_since=None,
            country=None,
        )
        assert score > 70, f"Expected >70 for all-None, got {score}"

    def test_score_bounded_0_100(self):
        for verified in (True, False):
            for spent in (None, 0, 50_000, 200_000):
                for rating in (None, 0, 2.5, 5.0):
                    score = compute_risk_score(
                        payment_verified=verified,
                        total_spent=spent,
                        hire_rate=50.0,
                        rating=rating,
                        reviews_count=10,
                        member_since=datetime.now(timezone.utc) - timedelta(days=365),
                        country="Germany",
                    )
                    assert 0.0 <= score <= 100.0

    def test_custom_weights(self):
        cfg = _RiskWeights()
        cfg.weight_payment_verified = 1.0
        cfg.weight_total_spent = 0.0
        cfg.weight_hire_rate = 0.0
        cfg.weight_rating = 0.0
        cfg.weight_reviews = 0.0
        cfg.weight_account_age = 0.0
        cfg.weight_location = 0.0

        score_unverified = compute_risk_score(
            payment_verified=False,
            total_spent=100_000, hire_rate=90.0, rating=5.0,
            reviews_count=50,
            member_since=datetime.now(timezone.utc) - timedelta(days=2000),
            country="United States", cfg=cfg,
        )
        assert score_unverified == 100.0

        score_verified = compute_risk_score(
            payment_verified=True,
            total_spent=100_000, hire_rate=90.0, rating=5.0,
            reviews_count=50,
            member_since=datetime.now(timezone.utc) - timedelta(days=2000),
            country="United States", cfg=cfg,
        )
        assert score_verified == 0.0


# ── detect_red_flags ───────────────────────────────────────────────────────


class TestDetectRedFlags:
    def test_clean_client_no_flags(self):
        flags = detect_red_flags(
            payment_verified=True, total_spent=50_000,
            hire_rate=80.0, rating=4.5, reviews_count=20,
            jobs_posted=25,
            member_since=datetime.now(timezone.utc) - timedelta(days=1000),
        )
        assert flags == []

    def test_unverified_payment_flag(self):
        flags = detect_red_flags(
            payment_verified=False, total_spent=50_000,
            hire_rate=80.0, rating=4.5, reviews_count=20,
            jobs_posted=25,
            member_since=datetime.now(timezone.utc) - timedelta(days=1000),
        )
        assert "Payment method NOT verified" in flags

    def test_zero_spend_flag(self):
        flags = detect_red_flags(
            payment_verified=True, total_spent=0,
            hire_rate=80.0, rating=4.5, reviews_count=20,
            jobs_posted=25,
            member_since=datetime.now(timezone.utc) - timedelta(days=1000),
        )
        assert any("$0 spent" in f for f in flags)

    def test_none_spend_flag(self):
        flags = detect_red_flags(
            payment_verified=True, total_spent=None,
            hire_rate=80.0, rating=4.5, reviews_count=20,
            jobs_posted=25,
            member_since=datetime.now(timezone.utc) - timedelta(days=1000),
        )
        assert any("$0 spent" in f for f in flags)

    def test_low_hire_rate_flag(self):
        flags = detect_red_flags(
            payment_verified=True, total_spent=50_000,
            hire_rate=10.0, rating=4.5, reviews_count=20,
            jobs_posted=25,
            member_since=datetime.now(timezone.utc) - timedelta(days=1000),
        )
        assert any("Hire rate below" in f for f in flags)

    def test_low_rating_flag(self):
        flags = detect_red_flags(
            payment_verified=True, total_spent=50_000,
            hire_rate=80.0, rating=2.0, reviews_count=20,
            jobs_posted=25,
            member_since=datetime.now(timezone.utc) - timedelta(days=1000),
        )
        assert any("Rating below" in f for f in flags)

    def test_new_account_flag(self):
        flags = detect_red_flags(
            payment_verified=True, total_spent=50_000,
            hire_rate=80.0, rating=4.5, reviews_count=20,
            jobs_posted=25,
            member_since=datetime.now(timezone.utc) - timedelta(days=10),
        )
        assert any("New account" in f for f in flags)

    def test_no_reviews_flag(self):
        flags = detect_red_flags(
            payment_verified=True, total_spent=50_000,
            hire_rate=80.0, rating=4.5, reviews_count=0,
            jobs_posted=15,
            member_since=datetime.now(timezone.utc) - timedelta(days=1000),
        )
        assert any("No reviews" in f for f in flags)

    def test_multiple_flags(self):
        flags = detect_red_flags(
            payment_verified=False, total_spent=0,
            hire_rate=5.0, rating=1.0, reviews_count=0,
            jobs_posted=20,
            member_since=datetime.now(timezone.utc) - timedelta(days=5),
        )
        assert len(flags) >= 4
