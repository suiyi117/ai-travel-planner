import os
from dataclasses import dataclass
from typing import Mapping


def parse_bool_env(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_csv_env(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def resolve_allowed_origins(raw_value: str | None, environment: str) -> list[str]:
    default_origins = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]
    origins = parse_csv_env(raw_value) or default_origins
    if environment == "production" and "*" in origins:
        raise RuntimeError("ALLOWED_ORIGINS cannot contain '*' when APP_ENV=production")
    return origins


@dataclass(frozen=True)
class Settings:
    app_env: str
    allowed_origins: list[str]
    expose_client_config: bool
    log_level: str
    ai_api_key: str
    ai_base_url: str
    ai_model: str
    amap_key: str
    amap_security_key: str
    juhe_flight_api_key: str


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    source = env or os.environ
    app_env = source.get("APP_ENV", "development").strip().lower() or "development"
    return Settings(
        app_env=app_env,
        allowed_origins=resolve_allowed_origins(source.get("ALLOWED_ORIGINS"), app_env),
        expose_client_config=parse_bool_env(source.get("EXPOSE_CLIENT_CONFIG"), False),
        log_level=source.get("LOG_LEVEL", "INFO").upper(),
        ai_api_key=source.get("AI_API_KEY", ""),
        ai_base_url=source.get("AI_BASE_URL", "https://api.openai.com/v1"),
        ai_model=source.get("AI_MODEL", "gpt-5.5"),
        amap_key=source.get("AMAP_KEY", ""),
        amap_security_key=source.get("AMAP_SECURITY_KEY", ""),
        juhe_flight_api_key=source.get("JUHE_FLIGHT_API_KEY", ""),
    )
