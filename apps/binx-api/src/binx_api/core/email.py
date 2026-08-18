import logging

from binx_api.core.config import get_settings

logger = logging.getLogger("binx_api.email")
settings = get_settings()


def send_email(*, to: str, subject: str, body: str) -> None:
    """Console-log email backend. Swap for a real provider (SES/SendGrid/Postmark) in production."""
    logger.info("EMAIL to=%s subject=%s\n%s", to, subject, body)


def send_verification_email(*, to: str, token: str) -> None:
    link = f"{settings.frontend_url}/verify-email?token={token}"
    send_email(to=to, subject="Verify your Binx Portal account", body=f"Click to verify your account: {link}")


def send_password_reset_email(*, to: str, token: str) -> None:
    link = f"{settings.frontend_url}/reset-password?token={token}"
    send_email(to=to, subject="Reset your Binx Portal password", body=f"Click to reset your password: {link}")
