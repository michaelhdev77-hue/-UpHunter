from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://uphunter:uphunter@localhost:5434/auth_db"
    secret_key: str = "dev-secret-key-change-me"
    access_token_expire_minutes: int = 1440
    redis_url: str = "redis://localhost:6380/0"
    kafka_bootstrap_servers: str = "kafka:29092"
    kafka_enabled: bool = True

    # Upwork OAuth 2.0
    upwork_client_id: str = ""
    upwork_client_secret: str = ""
    upwork_redirect_uri: str = "http://localhost:8000/auth/upwork/callback"
    upwork_auth_url: str = "https://www.upwork.com/ab/account-security/oauth2/authorize"
    upwork_token_url: str = "https://www.upwork.com/api/v3/oauth2/token"

    class Config:
        env_file = ".env"


settings = Settings()
