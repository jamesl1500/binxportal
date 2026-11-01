import asyncio
import logging

import boto3
from botocore.exceptions import ClientError

from binx_api.core.config import get_settings
from binx_api.core.email_templates import render_html

logger = logging.getLogger("binx_api.email")
settings = get_settings()

_ses_client = None


def _get_ses_client():
    global _ses_client
    if _ses_client is None:
        _ses_client = boto3.client("ses", region_name=settings.aws_region)
    return _ses_client


def _recipient_allowed(to: str) -> bool:
    # See core/config.py's ses_allowed_recipients — unset allows everyone.
    if not settings.ses_allowed_recipients:
        return True
    address = to.strip().lower()
    for entry in settings.ses_allowed_recipients.split(","):
        entry = entry.strip().lower()
        if entry and (address == entry or (entry.startswith("@") and address.endswith(entry))):
            return True
    return False


async def send_email(*, to: str, subject: str, body: str, html: str | None = None) -> None:
    """Sends via Amazon SES when configured (``SES_FROM_EMAIL`` set) — the
    boto3 call is sync, so it runs in a thread rather than blocking the event
    loop. Unset (every dev/test environment) just logs, same as before —
    see core/config.py's ``ses_from_email``.

    ``html`` is optional so a caller can still send a text-only message, but
    every ``send_*_email`` below provides one — a plain-text-only message is
    exactly the kind of body spam filters weight against a sender's
    reputation, and `Body.Html` + `Body.Text` together is what lets a mail
    client pick whichever it renders best. ``Destination.ToAddresses`` takes
    a list but is always called with exactly one recipient here — see each
    ``send_*_email``'s docstring for why (this app never discloses one
    recipient's address to another in the same message).

    ``settings.ses_reply_to``, when set, routes replies somewhere a person
    actually reads rather than the ``noreply@`` sending address (which has no
    inbox) — see core/config.py's docstring on it for the message this
    protects against.

    Fails soft: a delivery error is logged, not raised. The action that
    triggered the email (signup, an invite, ...) already succeeded on its
    own terms by the time this runs, and every one-shot link this app sends
    already has its own resend path (e.g. ``resend_verification``) — so a
    transient SES hiccup shouldn't turn into a 500 for something unrelated.
    """
    if not settings.ses_from_email:
        logger.info("EMAIL to=%s subject=%s\n%s", to, subject, body)
        return
    if not _recipient_allowed(to):
        logger.info("EMAIL (not in SES_ALLOWED_RECIPIENTS, not sent) to=%s subject=%s\n%s", to, subject, body)
        return
    message_body: dict = {"Text": {"Data": body, "Charset": "UTF-8"}}
    if html:
        message_body["Html"] = {"Data": html, "Charset": "UTF-8"}
    kwargs: dict = {
        "Source": settings.ses_from_email,
        "Destination": {"ToAddresses": [to]},
        "Message": {"Subject": {"Data": subject, "Charset": "UTF-8"}, "Body": message_body},
    }
    if settings.ses_reply_to:
        kwargs["ReplyToAddresses"] = [settings.ses_reply_to]
    try:
        await asyncio.to_thread(_get_ses_client().send_email, **kwargs)
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
        # A client verifies on the portal's own auth pages, not the staff ones.
        link = f"{settings.frontend_url}/portal/verify-email?token={token}&portal_invite={portal_invite_token}"
    await send_email(
        to=to,
        subject="Verify your Binx Portal account",
        body=f"Click to verify your account: {link}",
        html=render_html(
            heading="Verify your account",
            paragraphs=["One click confirms this is really you, so you can finish setting up Binx Portal."],
            cta_label="Verify email",
            cta_url=link,
        ),
    )


async def send_password_reset_email(*, to: str, token: str, portal: bool = False) -> None:
    # ``portal`` — the account is a client-portal contact, so the link lands
    # on the portal's own reset page rather than the staff one.
    link = f"{settings.frontend_url}/{'portal' if portal else 'auth'}/reset-password?token={token}"
    await send_email(
        to=to,
        subject="Reset your Binx Portal password",
        body=f"Click to reset your password: {link}",
        html=render_html(
            heading="Reset your password",
            paragraphs=["We got a request to reset your password. If that wasn't you, you can ignore this email."],
            cta_label="Reset password",
            cta_url=link,
        ),
    )


async def send_email_change_email(*, to: str, token: str) -> None:
    # Sent to the NEW address (not the account's current one) — confirming
    # from here proves the account holder actually controls it.
    link = f"{settings.frontend_url}/auth/confirm-email?token={token}"
    await send_email(
        to=to,
        subject="Confirm your new Binx Portal email",
        body=f"Click to confirm this email change: {link}",
        html=render_html(
            heading="Confirm your new email",
            paragraphs=["Confirming here finishes switching your Binx Portal account over to this address."],
            cta_label="Confirm email",
            cta_url=link,
        ),
    )


def build_invite_accept_url(token: str) -> str:
    return f"{settings.frontend_url}/auth/accept-invite?token={token}"


async def send_agency_invitation_email(*, to: str, agency_name: str, inviter_name: str, token: str) -> None:
    link = build_invite_accept_url(token)
    await send_email(
        to=to,
        subject=f"{inviter_name} invited you to join {agency_name} on Binx Portal",
        body=f"Click to accept the invitation: {link}",
        html=render_html(
            heading=f"You're invited to {agency_name}",
            paragraphs=[f"{inviter_name} invited you to join {agency_name}'s team on Binx Portal."],
            cta_label="Accept invitation",
            cta_url=link,
        ),
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
        html=render_html(
            heading=f"You're invited to {agency_name}'s client portal",
            paragraphs=[
                f"{inviter_name} at {agency_name} has given you portal access for {client_name}.",
                "You'll be able to follow project progress, view and pay invoices, and message the team.",
            ],
            cta_label="Accept invitation",
            cta_url=link,
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
        html=render_html(
            heading=f"Invoice {invoice_number} from {agency_name}",
            paragraphs=[
                f"{agency_name} has issued invoice {invoice_number}.",
                f"Amount due: {amount_due}",
                f"Due date: {due_date}",
                "Your account manager will follow up with payment details.",
            ],
        ),
    )


async def send_meeting_scheduled_email(
    *, to: str, agency_name: str, title: str, starts_at_local: str, location: str | None
) -> None:
    # starts_at_local is pre-formatted by the caller in the agency's own
    # timezone (see meetings/service.py) — this function never does its own
    # timezone math, same convention as every other pre-formatted value here.
    paragraphs = [f"{agency_name} scheduled a meeting with you.", title, f"When: {starts_at_local}"]
    if location:
        paragraphs.append(f"Where: {location}")
    paragraphs.append("You can view or cancel this meeting from your client portal.")
    await send_email(
        to=to,
        subject=f"Meeting scheduled: {title}",
        body=(
            f"{agency_name} scheduled a meeting with you.\n\n"
            f"{title}\n"
            f"When: {starts_at_local}\n" + (f"Where: {location}\n" if location else "") + "\n"
            "You can view or cancel this meeting from your client portal."
        ),
        html=render_html(heading=f"Meeting scheduled: {title}", paragraphs=paragraphs),
    )


async def send_meeting_cancelled_email(*, to: str, agency_name: str, title: str, starts_at_local: str) -> None:
    await send_email(
        to=to,
        subject=f"Meeting cancelled: {title}",
        body=(f"A meeting with {agency_name} has been cancelled.\n\n{title}\nWas scheduled for: {starts_at_local}"),
        html=render_html(
            heading=f"Meeting cancelled: {title}",
            paragraphs=[
                f"A meeting with {agency_name} has been cancelled.",
                title,
                f"Was scheduled for: {starts_at_local}",
            ],
        ),
    )


async def send_kickoff_sent_email(*, to: str, agency_name: str, project_name: str, kickoff_title: str) -> None:
    # No link, same reasoning as send_invoice_issued_email — a portal
    # contact already sees a live "kickoff" tab at /portal/projects/... once
    # they sign in, so this is just the notice that it's ready for them.
    await send_email(
        to=to,
        subject=f"{agency_name} needs a few answers to kick off {project_name}",
        body=(
            f"{agency_name} started “{kickoff_title}” for {project_name}.\n\n"
            "A few quick questions will help set expectations before work gets underway — "
            "sign in to your client portal to answer them."
        ),
        html=render_html(
            heading=f"A few answers to kick off {project_name}",
            paragraphs=[
                f"{agency_name} started “{kickoff_title}” for {project_name}.",
                "A few quick questions will help set expectations before work gets underway — "
                "sign in to your client portal to answer them.",
            ],
        ),
    )


async def send_kickoff_reminder_email(*, to: str, agency_name: str, project_name: str, kickoff_title: str) -> None:
    await send_email(
        to=to,
        subject=f"Reminder: {agency_name} is still waiting on the {project_name} kickoff",
        body=(
            f"Just a friendly reminder — “{kickoff_title}” for {project_name} is still waiting on your answers.\n\n"
            "Sign in to your client portal to finish it up."
        ),
        html=render_html(
            heading=f"Still waiting on the {project_name} kickoff",
            paragraphs=[
                f"Just a friendly reminder — “{kickoff_title}” for {project_name} is still waiting on your answers.",
                "Sign in to your client portal to finish it up.",
            ],
        ),
    )
