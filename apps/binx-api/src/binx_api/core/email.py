import logging

from binx_api.core.config import get_settings

logger = logging.getLogger("binx_api.email")
settings = get_settings()


def send_email(*, to: str, subject: str, body: str) -> None:
    """Console-log email backend. Swap for a real provider (SES/SendGrid/Postmark) in production."""
    logger.info("EMAIL to=%s subject=%s\n%s", to, subject, body)


def send_verification_email(*, to: str, token: str) -> None:
    # The frontend looks the account's email up from the token via GET
    # /auth/verify-email, so only the token needs to be in the link.
    link = f"{settings.frontend_url}/auth/verify-email?token={token}"
    send_email(to=to, subject="Verify your Binx Portal account", body=f"Click to verify your account: {link}")


def send_password_reset_email(*, to: str, token: str) -> None:
    link = f"{settings.frontend_url}/auth/reset-password?token={token}"
    send_email(to=to, subject="Reset your Binx Portal password", body=f"Click to reset your password: {link}")


def send_email_change_email(*, to: str, token: str) -> None:
    # Sent to the NEW address (not the account's current one) — confirming
    # from here proves the account holder actually controls it.
    link = f"{settings.frontend_url}/auth/confirm-email?token={token}"
    send_email(to=to, subject="Confirm your new Binx Portal email", body=f"Click to confirm this email change: {link}")


def build_invite_accept_url(token: str) -> str:
    return f"{settings.frontend_url}/auth/accept-invite?token={token}"


def send_agency_invitation_email(*, to: str, agency_name: str, inviter_name: str, token: str) -> None:
    link = build_invite_accept_url(token)
    send_email(
        to=to,
        subject=f"{inviter_name} invited you to join {agency_name} on Binx Portal",
        body=f"Click to accept the invitation: {link}",
    )


def build_portal_invite_accept_url(token: str) -> str:
    return f"{settings.frontend_url}/auth/portal-invite?token={token}"


def send_client_invitation_email(*, to: str, agency_name: str, client_name: str, inviter_name: str, token: str) -> None:
    link = build_portal_invite_accept_url(token)
    send_email(
        to=to,
        subject=f"{inviter_name} invited you to {agency_name}'s client portal",
        body=(
            f"{inviter_name} at {agency_name} has given you portal access for {client_name} — "
            f"you'll be able to follow project progress, view and pay invoices, and message the team.\n\n"
            f"Click to accept: {link}"
        ),
    )


def send_invoice_issued_email(
    *, to: str, agency_name: str, invoice_number: str, amount_due: str, due_date: str
) -> None:
    # A plain notice that an invoice has been issued. There is no client portal
    # yet, so there is nothing to link to — when one exists, this gains a
    # "view / pay" link the same way the invitation email carries its token.
    send_email(
        to=to,
        subject=f"Invoice {invoice_number} from {agency_name}",
        body=(
            f"{agency_name} has issued invoice {invoice_number}.\n"
            f"Amount due: {amount_due}\n"
            f"Due date: {due_date}\n\n"
            "Your account manager will follow up with payment details."
        ),
    )
