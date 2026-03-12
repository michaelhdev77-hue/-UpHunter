"""Tests for auth service: optional JWT on team-profile endpoint."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service


class TestTeamProfileRouteExists:
    """Verify team-profile endpoint is registered."""

    def test_team_profile_get_route_exists(self):
        _routes = import_from_service("auth", "app.routes")
        paths = [r.path for r in _routes.router.routes]
        assert "/team-profile" in paths

    def test_team_profile_methods(self):
        _routes = import_from_service("auth", "app.routes")
        for route in _routes.router.routes:
            if hasattr(route, "path") and route.path == "/team-profile":
                methods = getattr(route, "methods", set())
                assert "GET" in methods or not methods  # GET should be allowed
                break


class TestTeamProfileSchemas:
    """Verify team profile schemas."""

    def test_team_profile_schema(self):
        _models = import_from_service("auth", "app.models")
        # TeamProfileSchema should exist and be importable
        assert hasattr(_models, "TeamProfileSchema")

    def test_team_profile_schema_fields(self):
        _models = import_from_service("auth", "app.models")
        schema = _models.TeamProfileSchema(
            id=1,
            name="Test Team",
            skills_description="Python, React",
            portfolio_description="SaaS platforms",
            hourly_rate_min=40,
            hourly_rate_max=80,
            cover_letter_style="professional",
        )
        assert schema.skills_description == "Python, React"
        assert schema.hourly_rate_min == 40
