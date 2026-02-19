from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://tarteel:password@localhost:5432/tarteel"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = ""  # REQUIRED — set a long random string in .env
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 10080  # 7 days

    # Admin
    ADMIN_API_KEY: str = ""  # REQUIRED — set a long random string in .env

    # Twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = "whatsapp:+14155238886"

    # SendGrid
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "noreply@tarteel.app"

    # Gmail SMTP (alternative to SendGrid)
    GMAIL_USER: str = ""
    GMAIL_APP_PASSWORD: str = ""

    # Brevo SMTP
    BREVO_SMTP_USER: str = ""
    BREVO_SMTP_KEY: str = ""

    # OpenCage (optional)
    OPENCAGE_API_KEY: str = ""

    # App URLs
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    HLS_SERVE_URL: str = "http://localhost:8001"

    # Audio
    AUDIO_DIR: str = "/run/media/saadat/A/Tarteel/audio"
    HLS_OUTPUT_DIR: str = "/run/media/saadat/A/Tarteel/hls"
    DEFAULT_RECITER: str = "Alafasy_128kbps"

    # Ramadan
    RAMADAN_START_DATE: str = "2026-02-18"
    RAMADAN_TOTAL_NIGHTS: int = 30

    # Set to False for local HTTP dev; True in production (HTTPS only)
    COOKIE_SECURE: bool = False

    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
