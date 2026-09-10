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
    # A just-used refresh token is still accepted for this many seconds so
    # near-simultaneous requests from one session (multiple tabs, the proxy's
    # parallel data fetches) don't rotate it out from under each other. Replay
    # after this window is still rejected — see auth/service.py's refresh().
    refresh_token_reuse_grace_seconds: int = 30

    # Per-client rate limiting on the auth endpoints (login / signup / password
    # reset / verification resend). Storage is in-process — fine for a single
    # instance; front with Redis (limits[async-redis]) before scaling out. The
    # test suite pins this off; the rate-limit test flips it back on.
    rate_limit_enabled: bool = True

    # Base URL of the staff portal frontend, used to build links in emails
    frontend_url: str = "http://localhost:3000"

    # Local-disk root for uploaded project files. Fine for now; swap for
    # object storage (S3, etc.) later without changing ProjectFile's shape —
    # storage_path would just become a key instead of a filesystem path.
    project_upload_dir: str = "uploads/projects"
    # Per-file cap, enforced in projects/service.py's save_project_file.
    project_upload_max_bytes: int = 25 * 1024 * 1024

    # Local-disk root for message attachments — same storage approach as
    # project files (see messaging/service.py). Swap for object storage later
    # without touching MessageAttachment's shape.
    message_upload_dir: str = "uploads/messages"
    # Per-file cap, enforced in messaging/service.py's save_message_attachment.
    message_upload_max_bytes: int = 25 * 1024 * 1024

    # How long a websocket connection ticket stays valid. The browser can't
    # send the bearer token on a cross-origin WS handshake, so it trades the
    # session for one of these short-lived, single-purpose tokens first (see
    # auth/router.py's /auth/ws-ticket and messaging/realtime.py).
    ws_ticket_expire_seconds: int = 60

    # Local-disk root for an agency's logo / cover image — same storage
    # approach as project files (see agencies/service.py). Swap for object
    # storage later without touching AgencyProfile's shape.
    agency_upload_dir: str = "uploads/agencies"
    # Per-image cap, enforced in agencies/service.py's save_agency_image.
    agency_image_max_bytes: int = 5 * 1024 * 1024

    # --- AI (modules/ai/) ---------------------------------------------------
    # The Anthropic SDK's own default env var — anthropic.AsyncAnthropic()
    # would pick this up with zero config, but we read it explicitly so
    # "unset" is a clean, checkable state (see ai/client.py's AiNotConfigured).
    anthropic_api_key: str | None = None
    # The default, capable model — real reasoning tasks (lead-website
    # analysis, the "Ask AI" assistant). ai_fast_model is the cheaper/quicker
    # model for templated drafts; see ai/client.py::complete's `fast` flag.
    ai_model: str = "claude-opus-5"
    ai_fast_model: str = "claude-haiku-4-5"
    # Seeded onto a new agency's AgencyAiSettings row on first access; each
    # agency's owner/admin can raise these afterward (ai/router.py).
    ai_default_monthly_budget_cents: int = 2000
    ai_default_daily_user_cap: int = 50


@lru_cache
def get_settings() -> Settings:
    return Settings()
