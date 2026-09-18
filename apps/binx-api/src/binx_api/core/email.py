import asyncio
import logging

import boto3
from botocore.exceptions import ClientError

from binx_api.core.config import get_settings

logger = logging.getLogger("binx_api.email")
settings = get_settings()

_ses_client = None


def _get_ses_client():
    global _ses_client
    if _ses_client is None:
        _ses_client = boto3.client("ses", region_name=settings.aws_region)
    return _ses_client


async def send_email(*, to: str, subject: str, body: str) -> None:
    """Sends via Amazon SES when configured (``SES_FROM_EMAIL`` set) — the
    boto3 call is sync, so it runs in a thread rather than blocking the event
    loop. Unset (every dev/test environment) just logs, same as before —
    see core/config.py's ``ses_from_email``.

    Fails soft: a delivery error is logged, not raised. The action that
    triggered the email (signup, an invite, ...) already succeeded on its
    own terms by the time this runs, and every one-shot link this app sends
    already has its own resend path (e.g. ``resend_verification``) — so a
    transient SES hiccup shouldn't turn into a 500 for something unrelated.
    """
    if not settings.ses_from_email:
        logger.info("EMAIL to=%s subject=%s\n%s", to, subject, body)
        return
    try:
        await asyncio.to_thread(
            _get_ses_client().send_email,
            Source=settings.ses_from_email,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            },
        )
    except ClientError:
        logger.exception("Failed to send email to=%s subject=%s", to, subject)


async def send_verification_email(*, to: str, token: str, portal_invite_token: str | None = None) -> None:
    # The frontend looks the account's email up from the token via GET
    # /auth/verify-email, so only the token needs to be in the link.
    link = f"{settings.frontend_url}/auth/verify-email?token={token}"
    if portal_invite_token:
        # Carries a pending client-portal invite through verification, so
        # signup -> verify-email -> back to /auth/portal-invite never
        # detours through staff onboarding. See verify-email/actions.ts.
        link += f"&portal_invite={portal_invite_token}"
    await send_email(to=to, subject="Verify your Binx Portal account", body=f"Click to verify your account: {link}")


async def send_password_reset_email(*, to: str, token: str) -> None:
    link = f"{settings.frontend_url}/auth/reset-password?token={token}"
    await send_email(to=to, subject="Reset your Binx Portal password", body=f"Click to reset your password: {link}")


async def send_email_change_email(*, to: str, token: str) -> None:
    # Sent to the NEW address (not the account's current one) — confirming
    # from here proves the account holder actually controls it.
    link = f"{settings.frontend_url}/auth/confirm-email?token={token}"
    await send_email(
        to=to, subject="Confirm your new Binx Portal email", body=f"Click to confirm this email change: {link}"
    )


def build_invite_accept_url(token: str) -> str:
    return f"{settings.frontend_url}/auth/accept-invite?token={token}"


async def send_agency_invitation_email(*, to: str, agency_name: str, inviter_name: str, token: str) -> None:
    link = build_invite_accept_url(token)
    await send_email(
        to=to,
        subject=f"{inviter_name} invited you to join {agency_name} on Binx Portal",
        body=f"Click to accept the invitation: {link}",
    )


def build_portal_invite_accept_url(token: str) -> str:
    return f"{settings.frontend_url}/auth/portal-invite?token={token}"


async def send_client_invitation_email(
    *, to: str, agency_name: str, client_name: str, inviter_name: str, token: str
) -> None:
    link = build_portal_invite_accept_url(token)
    await send_email(
        to=to,
        subject=f"{inviter_name} invited you to {agency_name}'s client portal",
        body=(
            f"{inviter_name} at {agency_name} has given you portal access for {client_name} — "
            f"you'll be able to follow project progress, view and pay invoices, and message the team.\n\n"
            f"Click to accept: {link}"
        ),
    )


async def send_invoice_issued_email(
    *, to: str, agency_name: str, invoice_number: str, amount_due: str, due_date: str
) -> None:
    # A plain notice that an invoice has been issued — no link, since a
    # client without portal access yet has nowhere to click through to; a
    # client-portal contact already gets a live, scoped invoice list at
    # /portal/invoices instead of relying on this notice.
    await send_email(
        to=to,
        subject=f"Invoice {invoice_number} from {agency_name}",
        body=(
            f"{agency_name} has issued invoice {invoice_number}.\n"
            f"Amount due: {amount_due}\n"
            f"Due date: {due_date}\n\n"
            "Your account manager will follow up with payment details."
        ),
    )


async def send_meeting_scheduled_email(
    *, to: str, agency_name: str, title: str, starts_at_local: str, location: str | None
) -> None:
    # starts_at_local is pre-formatted by the caller in the agency's own
    # timezone (see meetings/service.py) — this function never does its own
    # timezone math, same convention as every other pre-formatted value here.
    await send_email(
        to=to,
        subject=f"Meeting scheduled: {title}",
        body=(
            f"{agency_name} scheduled a meeting with you.\n\n"
            f"{title}\n"
            f"When: {starts_at_local}\n" + (f"Where: {location}\n" if location else "") + "\n"
            "You can view or cancel this meeting from your client portal."
        ),
    )


async def send_meeting_cancelled_email(*, to: str, agency_name: str, title: str, starts_at_local: str) -> None:
    await send_email(
        to=to,
        subject=f"Meeting cancelled: {title}",
        body=(f"A meeting with {agency_name} has been cancelled.\n\n{title}\nWas scheduled for: {starts_at_local}"),
    )
