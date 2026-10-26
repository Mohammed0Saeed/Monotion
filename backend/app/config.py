from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://maki:maki@127.0.0.1:5432/maki"
    secret_key: str = "dev-secret-change-me"
    allow_registration: bool = True
    token_days: int = 30
    # the desktop build bundles the UI somewhere else than the source tree
    frontend_dist: Path = ROOT / "frontend" / "dist"


settings = Settings()
