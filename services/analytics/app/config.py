from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://uphunter:uphunter@localhost:5438/analytics_db"
    secret_key: str = "dev-secret-key-change-me"
    redis_url: str = "redis://localhost:6381/0"
    kafka_bootstrap_servers: str = "kafka:29092"
    kafka_enabled: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
