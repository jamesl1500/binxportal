"""The email code gate: an optional second check before a proposal opens on
its share link, for agencies whose pricing is sensitive.

The share link is already a long random secret. With ``require_email_code``
on, it isn't enough: the visitor asks for a code, which only ever goes to
the proposal's recipient address, and trades it for an access token (a
signed JWT, 30 days) that the web app keeps in an httpOnly cookie and sends
back on every share-link request in the ``X-Proposal-Access`` header.

Guessing is capped: a code is six digits, single-use, good for 15 minutes
and five tries; a new one can be sent once a minute and five times a day.
That's at most 25 guesses a day against a million codes. A verified code
adds "email_verified" to the audit trail, so the signing certificate shows
the signer had the recipient's inbox.

Signed-in portal contacts don't need it: their account already proves who
they are.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from jwt import PyJWTError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import email as email_service
from binx_api.core.config import get_settings
from binx_api.core.errors import Conflict, Forbidden, TooManyRequests, Unprocessable
from binx_api.modules.agencies.models import Agency
from binx_api.modules.proposals import signing
from binx_api.modules.proposals.models import EVENT_EMAIL_VERIFIED, STATUS_DRAFT, Proposal

settings = get_settings()

ACCESS_HEADER = "X-Proposal-Access"
CODE_TTL = timedelta(minutes=15)
RESEND_AFTER = timedelta(seconds=60)
MAX_ATTEMPTS = 5
SEND_WINDOW = timedelta(days=1)
MAX_SENDS_PER_WINDOW = 5
ACCESS_TTL = timedelta(days=30)
_TOKEN_TYPE = "proposal_access"


def mask_email(email: str | None) -> str:
    """ "jane@fjord.example" -> "j•••@fjord.example": enough to recognise
    your own address, not enough to learn someone else's."""
    if not email or "@" not in email:
        return "the recipient"
    local, domain = email.split("@", 1)
    return f"{local[:1]}•••@{domain}"


def _code_hash(proposal: Proposal, code: str) -> str:
    key = settings.jwt_secret.encode()
    return hmac.new(key, f"{proposal.id}:{code}".encode(), hashlib.sha256).hexdigest()


def _link_fingerprint(proposal: Proposal) -> str:
    return hashlib.sha256(proposal.share_token.encode()).hexdigest()[:16]


def issue_access_token(proposal: Proposal, *, now: datetime | None = None) -> str:
    """Tied to the proposal and its share link."""
    now = now or datetime.now(UTC)
    payload = {
        "sub": str(proposal.id),
        "type": _TOKEN_TYPE,
        "link": _link_fingerprint(proposal),
        "exp": now + ACCESS_TTL,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def has_access(proposal: Proposal, access_token: str | None) -> bool:
    if not proposal.require_email_code:
        return True
    if not access_token:
        return False
    try:
        payload = jwt.decode(access_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except PyJWTError:
        return False
    return (
        payload.get("type") == _TOKEN_TYPE
        and payload.get("sub") == str(proposal.id)
        and payload.get("link") == _link_fingerprint(proposal)
    )


def require_access(proposal: Proposal, access_token: str | None, agency_name: str) -> None:
    """403 ``email_code_required`` until the visitor has verified. The
    details are what the code page shows; never the proposal itself."""
    if has_access(proposal, access_token):
        return
    raise Forbidden(
        "Enter the code we emailed to open this proposal.",
        code="email_code_required",
        details={
            "agency_name": agency_name,
            "title": proposal.title,
            "email_hint": mask_email(proposal.recipient_email),
        },
    )


async def send_code(db: AsyncSession, proposal: Proposal, *, now: datetime | None = None) -> str:
    """Emails a fresh code to the recipient (replacing any earlier one).
    Returns the masked address it went to."""
    now = now or datetime.now(UTC)
    if not proposal.require_email_code:
        raise Conflict("This proposal opens without a code.")
    if proposal.status == STATUS_DRAFT or not proposal.recipient_email:
        raise Conflict("This proposal can't be opened yet.")
    if proposal.access_code_sent_at and now - proposal.access_code_sent_at < RESEND_AFTER:
        raise TooManyRequests("We've just sent a code. Give it a minute, then ask again.")
    if proposal.access_code_window_started_at is None or now - proposal.access_code_window_started_at >= SEND_WINDOW:
        proposal.access_code_window_started_at = now
        proposal.access_code_window_sends = 0
    if proposal.access_code_window_sends >= MAX_SENDS_PER_WINDOW:
        raise TooManyRequests("That's a lot of codes for one day. Try again tomorrow, or ask the agency to resend it.")

    code = f"{secrets.randbelow(10**6):06d}"
    proposal.access_code_hash = _code_hash(proposal, code)
    proposal.access_code_expires_at = now + CODE_TTL
    proposal.access_code_sent_at = now
    proposal.access_code_attempts = 0
    proposal.access_code_window_sends += 1
    await db.commit()

    agency = await db.get(Agency, proposal.agency_id)
    await email_service.send_proposal_code_email(
        to=proposal.recipient_email,
        agency_name=agency.name if agency else "Your agency",
        title=proposal.title,
        code=code,
        minutes=int(CODE_TTL.total_seconds() // 60),
    )
    return mask_email(proposal.recipient_email)


async def verify_code(
    db: AsyncSession,
    proposal: Proposal,
    code: str,
    *,
    ip_address: str | None = None,
    user_agent: str | None = None,
    now: datetime | None = None,
) -> str:
    """Trades a correct code for an access token. Each code works once."""
    now = now or datetime.now(UTC)
    if not proposal.require_email_code:
        return issue_access_token(proposal, now=now)
    if proposal.access_code_hash is None or proposal.access_code_expires_at is None:
        raise Unprocessable("Ask for a code first.", code="code_missing")
    if proposal.access_code_expires_at <= now:
        raise Unprocessable("That code has expired. Ask for a new one.", code="code_expired")
    if proposal.access_code_attempts >= MAX_ATTEMPTS:
        raise TooManyRequests("Too many tries with that code. Ask for a new one.")

    proposal.access_code_attempts += 1
    given = "".join(ch for ch in code if ch.isdigit())
    if not hmac.compare_digest(_code_hash(proposal, given), proposal.access_code_hash):
        await db.commit()
        left = MAX_ATTEMPTS - proposal.access_code_attempts
        raise Unprocessable(
            "That code isn't right." + (f" {left} {'try' if left == 1 else 'tries'} left." if left else ""),
            code="code_wrong",
        )

    proposal.access_code_hash = None
    proposal.access_code_expires_at = None
    signing.record_event(
        db,
        proposal.id,
        EVENT_EMAIL_VERIFIED,
        actor_label="Recipient (share link)",
        ip_address=ip_address,
        user_agent=user_agent,
        detail=f"Opened with the code emailed to {mask_email(proposal.recipient_email)}",
        occurred_at=now,
    )
    await db.commit()
    return issue_access_token(proposal, now=now)
