from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://uphunter:uphunter@localhost:5438/letters_db"
    secret_key: str = "dev-secret-key-change-me"
    redis_url: str = "redis://localhost:6381/0"
    kafka_bootstrap_servers: str = "kafka:29092"
    kafka_enabled: bool = True
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_temp_cover_letter: float = 0.7
    openai_temp_translation: float = 0.3
    jobs_service_url: str = "http://jobs:8101"

    class Config:
        env_file = ".env"


settings = Settings()
