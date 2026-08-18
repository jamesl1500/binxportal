from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://binxapi:binxapi@localhost:5432/binxportal"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    email_verification_token_expire_hours: int = 24
    password_reset_token_expire_minutes: int = 30
    # Base URL of the staff portal frontend, used to build links in emails
    frontend_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
