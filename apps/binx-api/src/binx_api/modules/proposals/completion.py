"""What happens when a proposal becomes complete: every required signature
is in (the client's, plus the agency's countersignature when required).

Today that means sending each party the signed record as a PDF. Accepting a
proposal from a lead (converting them to a client and opening their portal)
hooks in here too, see the lead portal work.

Runs after the signature has been committed, so a failure here (a PDF or
email problem) never undoes a signature: it's reported and the signed
record stays downloadable from the certificate pages.
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import email as email_service
from binx_api.core.config import get_settings
from binx_api.core.errors import capture_error
from binx_api.modules.proposals import signing
from binx_api.modules.proposals.certificate_pdf import certificate_file_name, render_certificate_pdf
from binx_api.modules.proposals.models import Proposal

logger = logging.getLogger(__name__)
settings = get_settings()


def public_certificate_url(proposal: Proposal) -> str:
    return f"{settings.frontend_url}/proposals/public/certificate?token={proposal.share_token}"


def staff_certificate_url(proposal: Proposal) -> str:
    return f"{settings.frontend_url}/proposals/{proposal.id}/certificate"


async def send_signed_record(db: AsyncSession, proposal: Proposal, *, agency_email: str | None) -> None:
    """Emails the signed PDF to the client signer and to the agency side (the
    countersigner, or whoever drafted the proposal). Fails soft."""
    try:
        certificate = await signing.build_certificate(db, proposal)
        pdf = render_certificate_pdf(certificate)
    except Exception as exc:  # noqa: BLE001 - reported; the signature itself is already saved
        await capture_error(exc, tags={"job": "proposal_signed_record"}, context={"proposal_id": str(proposal.id)})
        return

    signers = certificate.signature.signer_name
    if certificate.countersignature is not None:
        signers += f" and {certificate.countersignature.signer_name} for {certificate.agency_name}"
    name = certificate_file_name(certificate)
    recipients = [(certificate.signature.signer_email, public_certificate_url(proposal))]
    if agency_email and agency_email.casefold() != certificate.signature.signer_email.casefold():
        recipients.append((agency_email, staff_certificate_url(proposal)))
    for to, view_url in recipients:
        await email_service.send_proposal_signed_email(
            to=to,
            agency_name=certificate.agency_name,
            title=certificate.title,
            signer_names=signers,
            pdf=pdf,
            pdf_name=name,
            view_url=view_url,
        )
