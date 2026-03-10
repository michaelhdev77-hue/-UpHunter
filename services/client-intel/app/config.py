from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://uphunter:uphunter@localhost:5434/clients_db"
    secret_key: str = "dev-secret-key-change-me"
    redis_url: str = "redis://localhost:6380/0"
    kafka_bootstrap_servers: str = "kafka:29092"
    kafka_enabled: bool = True
    upwork_api_url: str = "https://www.upwork.com/api/graphql"
    auth_service_url: str = "http://auth:8105"

    class Config:
        env_file = ".env"


settings = Settings()
