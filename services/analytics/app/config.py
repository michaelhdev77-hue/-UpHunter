from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://uphunter:uphunter@localhost:5438/analytics_db"
    secret_key: str = "dev-secret-key-change-me"
    redis_url: str = "redis://localhost:6381/0"
    kafka_bootstrap_servers: str = "kafka:29092"
    kafka_enabled: bool = True
    jobs_service_url: str = "http://jobs:8101"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    telegram_enabled: bool = False
    telegram_score_threshold: int = 70
    frontend_url: str = "http://localhost:3002"

    class Config:
        env_file = ".env"


settings = Settings()
