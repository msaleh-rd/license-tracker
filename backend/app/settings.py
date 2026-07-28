from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    app_name: str = "License Lifecycle Hub"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./license_tracker.db"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480
    cors_origins: str = "http://localhost:3000"
    upload_dir: str = "data/uploads"
    default_alert_days_urgent: int = 30
    default_alert_days_review: int = 60
    demo_admin_email: str = "admin"
    demo_admin_password: str = "admin"
    demo_ops_email: str = "ops@example.com"
    demo_ops_password: str = "Ops123!"
    demo_viewer_email: str = "viewer@example.com"
    demo_viewer_password: str = "View123!"

    # Keycloak SSO Settings
    keycloak_enabled: bool = True
    keycloak_url: str = "https://identity.vertodemos.com:8443"
    keycloak_realm: str = "vertowave"
    keycloak_client_id: str = "vertowave"
    keycloak_bypass_in_development: bool = False

    # SMTP / email notification settings
    smtp_enabled: bool = False
    smtp_host: str = "smtp.example.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_from_email: str = "no-reply@example.com"
    smtp_from_name: str = "License Lifecycle Hub"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()