from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "staging", "production"] = "development"
    app_name: str = "CompanyAudit Enterprise API"
    api_prefix: str = "/api"

    database_url: str = Field(..., description="PostgreSQL SQLAlchemy connection URL")
    test_database_url: str | None = Field(default=None, description="PostgreSQL URL for pytest")

    jwt_secret_key: str = Field(..., min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    evidence_storage_dir: str = "./storage/evidence"
    max_evidence_bytes: int = 26_214_400

    allow_demo_seed: bool = False
    demo_account_password: str | None = None
    cookie_secure: bool = False

    # Optional server-side external AI integration (never exposed to browser)
    ai_provider: Literal["openai", "anthropic", "gemini"] | None = None
    ai_api_key: str | None = None
    ai_model: str | None = None

    # Optional telemetry & operational automation
    sentry_dsn: str | None = None
    enable_background_scheduler: bool = True
    scheduler_interval_seconds: int = 900
    rate_limit_enabled: bool = True

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret(cls, value: str, info) -> str:
        env = info.data.get("environment", "development")
        if "replace_with" in value.lower() or len(value.strip()) < 32:
            if env in {"production", "staging"}:
                raise ValueError("JWT_SECRET_KEY must be replaced with a 32+ char secret outside dev.")
        return value

    @model_validator(mode="after")
    def validate_production_posture(self) -> "Settings":
        if self.environment in {"production", "staging"}:
            if self.allow_demo_seed:
                raise ValueError("ALLOW_DEMO_SEED must be false in staging/production environments.")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in staging/production environments.")
            origins = self.cors_origin_list
            if not origins or "*" in origins:
                raise ValueError("CORS_ORIGINS cannot contain wildcard '*' in staging/production.")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def evidence_root(self) -> Path:
        raw = Path(self.evidence_storage_dir)
        return raw if raw.is_absolute() else (BACKEND_ROOT / raw).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
