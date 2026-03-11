"""Unit tests for auth service — password hashing, JWT, schemas."""
from __future__ import annotations

import time

import pytest
from jose import jwt

from tests._import_helper import import_from_service

_routes = import_from_service("auth", "app.routes")
_config = import_from_service("auth", "app.config")
_models = import_from_service("auth", "app.models")

hash_password = _routes.hash_password
verify_password = _routes.verify_password
create_jwt = _routes.create_jwt
settings = _config.settings

LoginRequest = _models.LoginRequest
TokenResponse = _models.TokenResponse
UserResponse = _models.UserResponse
TeamProfileUpdate = _models.TeamProfileUpdate
UserUpdateRequest = _models.UserUpdateRequest


# ── Password hashing ──────────────────────────────────────────────────────


class TestPasswordHashing:
    def test_hash_returns_string(self):
        hashed = hash_password("test123")
        assert isinstance(hashed, str)
        assert hashed != "test123"

    def test_hash_is_bcrypt(self):
        hashed = hash_password("password")
        assert hashed.startswith("$2")

    def test_verify_correct_password(self):
        hashed = hash_password("secure_password")
        assert verify_password("secure_password", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_different_hashes_same_password(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2
        assert verify_password("same", h1)
        assert verify_password("same", h2)

    def test_empty_password(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("x", hashed) is False


# ── JWT ────────────────────────────────────────────────────────────────────


class TestJWT:
    def test_create_jwt_returns_string(self):
        token = create_jwt(user_id=1, email="test@example.com")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_jwt_payload_contents(self):
        token = create_jwt(user_id=42, email="user@test.com")
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        assert payload["sub"] == "42"
        assert payload["email"] == "user@test.com"
        assert "exp" in payload

    def test_jwt_expiration_is_future(self):
        token = create_jwt(user_id=1, email="a@b.com")
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        assert payload["exp"] > time.time()

    def test_jwt_invalid_secret_fails(self):
        token = create_jwt(user_id=1, email="a@b.com")
        with pytest.raises(Exception):
            jwt.decode(token, "wrong-secret", algorithms=["HS256"])


# ── Pydantic schemas ──────────────────────────────────────────────────────


class TestAuthSchemas:
    def test_login_request(self):
        req = LoginRequest(email="test@example.com", password="pass123")
        assert req.email == "test@example.com"

    def test_token_response(self):
        resp = TokenResponse(access_token="abc123")
        assert resp.token_type == "bearer"

    def test_user_response(self):
        resp = UserResponse(id=1, email="a@b.com", is_active=True)
        assert resp.name is None

    def test_team_profile_update_partial(self):
        update = TeamProfileUpdate(name="New Name")
        dumped = update.model_dump(exclude_unset=True)
        assert dumped == {"name": "New Name"}
        assert "skills_description" not in dumped

    def test_user_update_request(self):
        update = UserUpdateRequest(name="New Name", new_password="new_pass")
        assert update.current_password is None
