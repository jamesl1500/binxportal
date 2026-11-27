"""What makes a proposal signature binding: the consent the signer gives,
a tamper-evident record of the exact document they signed, and the audit
trail around it.

Built for the US ESIGN Act / UETA requirements a typed-name signature has to
meet: the signer shows intent (they type their name and press sign), agrees
to do business electronically (the consent statement, recorded word for
word with its version), the signature is tied to the record it applies to
(the document hash), and the record can be reproduced later (the frozen
snapshot plus the audit trail). It is not legal advice; the wording in
``CONSENT_TEXT`` should be reviewed by counsel before relying on it.

The document record: when a proposal is sent, ``freeze_document`` writes a
canonical JSON snapshot of everything the recipient is agreeing to (text,
line items, totals, and each attachment's sha256) and its SHA-256. Sent
proposals can't be edited, so the snapshot stays true; the signer's request
carries the hash they were shown and is refused if it doesn't match. The one
change a sent proposal allows is the recipient's own choice of package and
add-ons (service.choose_options), which freezes it again: the snapshot holds
only the lines in the deal, so the signature points at exactly what they
chose.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies.models import Agency
from binx_api.modules.proposals import options
from binx_api.modules.proposals.models import (
    EVENT_VIEWED,
    STATUS_DRAFT,
    STATUS_SIGNED,
    Proposal,
    ProposalAttachment,
    ProposalCountersignature,
    ProposalEvent,
    ProposalLineItem,
    ProposalPackage,
    ProposalSignature,
)
from binx_api.modules.proposals.schemas import (
    CertificateAttachmentRead,
    CertificateLineRead,
    CertificateSignatureRead,
    ProposalCertificateRead,
    ProposalEventRead,
)

# Bump the version whenever the wording changes; a signature keeps the exact
# text and version it was given.
CONSENT_VERSION = "2026-11-25"
CONSENT_TEXT = (
    "I agree to sign this proposal electronically. Typing my name and selecting "
    "Sign is my signature, and it is as legally binding as a handwritten one. "
    "I consent to receive this proposal, the signed record and related notices "
    "electronically, and I confirm I can open and keep a copy of them."
)

SNAPSHOT_VERSION = 3
# Repeat views from the same browser within this window add no new event.
VIEW_DEDUPE_WINDOW = timedelta(minutes=30)


def _canonical_json(data: dict[str, Any]) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def hash_snapshot(snapshot: str) -> str:
    return hashlib.sha256(snapshot.encode("utf-8")).hexdigest()


def _iso(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat() if value else None


async def build_snapshot(
    db: AsyncSession,
    proposal: Proposal,
    *,
    lines: Sequence[ProposalLineItem] | None = None,
    packages: Sequence[ProposalPackage] | None = None,
) -> str:
    """The canonical JSON of everything a recipient agrees to. Keys are
    sorted and numbers are strings or integers, so the same proposal always
    produces the same bytes (and the same hash). A caller that already has
    the proposal's lines (in position order) and packages passes them, which
    saves the round trips."""
    agency = await db.get(Agency, proposal.agency_id)
    if packages is None:
        packages = await options.list_packages(db, proposal.id)
    if lines is None:
        lines = await options.list_lines(db, proposal.id)
    chosen = options.chosen_package(packages)
    lines = options.included_lines(lines, packages)
    attachments = (
        await db.execute(
            select(ProposalAttachment)
            .where(ProposalAttachment.proposal_id == proposal.id)
            .order_by(ProposalAttachment.position, ProposalAttachment.created_at)
        )
    ).scalars()
    return _canonical_json(
        {
            "version": SNAPSHOT_VERSION,
            "proposal_id": str(proposal.id),
            "agency": {"id": str(proposal.agency_id), "name": agency.name if agency else None},
            "title": proposal.title,
            "recipient_name": proposal.recipient_name,
            "recipient_email": proposal.recipient_email,
            "content": proposal.content,
            "currency": proposal.currency,
            "tax_rate_percent": str(proposal.tax_rate_percent),
            "subtotal_cents": proposal.subtotal_cents,
            "tax_cents": proposal.tax_cents,
            "total_cents": proposal.total_cents,
            # v2: per-month totals and each line's billing.
            "monthly_subtotal_cents": proposal.monthly_subtotal_cents,
            "monthly_tax_cents": proposal.monthly_tax_cents,
            "monthly_total_cents": proposal.monthly_total_cents,
            "valid_until": _iso(proposal.valid_until),
            "sent_at": _iso(proposal.sent_at),
            # v3: the chosen package, and only the lines in the deal (add-ons
            # flagged); lines left out aren't part of what's signed.
            "package": {"name": chosen.name, "description": chosen.description} if chosen else None,
            "line_items": [
                {
                    "position": line.position,
                    "description": line.description,
                    "details": line.details,
                    "quantity": str(line.quantity),
                    "unit_price_cents": line.unit_price_cents,
                    "amount_cents": line.amount_cents,
                    "billing": line.billing,
                    "add_on": line.optional,
                }
                for line in lines
            ],
            "attachments": [
                {"file_name": item.file_name, "size": item.size, "sha256": item.sha256} for item in attachments
            ],
        }
    )


async def freeze_document(
    db: AsyncSession,
    proposal: Proposal,
    *,
    lines: Sequence[ProposalLineItem] | None = None,
    packages: Sequence[ProposalPackage] | None = None,
) -> None:
    """Records the snapshot and its hash on the proposal (the caller commits)."""
    snapshot = await build_snapshot(db, proposal, lines=lines, packages=packages)
    proposal.document_snapshot = snapshot
    proposal.document_hash = hash_snapshot(snapshot)


async def ensure_document_record(db: AsyncSession, proposal: Proposal) -> None:
    """Proposals sent before document records existed get one the first time
    they're opened or signed. Sent proposals can't change, so the record made
    now is the same document the recipient was sent."""
    if proposal.status == STATUS_DRAFT or proposal.document_hash:
        return
    await freeze_document(db, proposal)
    await db.commit()


def snapshot_is_intact(proposal: Proposal) -> bool:
    """True when the stored snapshot still hashes to the stored fingerprint."""
    if not proposal.document_snapshot or not proposal.document_hash:
        return False
    return hash_snapshot(proposal.document_snapshot) == proposal.document_hash


def record_event(
    db: AsyncSession,
    proposal_id: uuid.UUID,
    kind: str,
    *,
    actor_user_id: uuid.UUID | None = None,
    actor_label: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    detail: str | None = None,
    occurred_at: datetime | None = None,
) -> ProposalEvent:
    """Adds one audit-trail row; the caller commits with the change it records."""
    event = ProposalEvent(
        proposal_id=proposal_id,
        kind=kind,
        occurred_at=occurred_at or datetime.now(UTC),
        actor_user_id=actor_user_id,
        actor_label=(actor_label or None) and actor_label[:255],
        ip_address=(ip_address or None) and ip_address[:64],
        user_agent=(user_agent or None) and user_agent[:512],
        detail=(detail or None) and detail[:1024],
    )
    db.add(event)
    return event


async def record_view(
    db: AsyncSession,
    proposal_id: uuid.UUID,
    *,
    actor_user_id: uuid.UUID | None,
    actor_label: str,
    ip_address: str | None,
    user_agent: str | None,
) -> bool:
    """Adds a "viewed" event unless the same browser already viewed within
    the dedupe window (a reload shouldn't flood the trail). Returns whether
    one was added; the caller commits."""
    since = datetime.now(UTC) - VIEW_DEDUPE_WINDOW
    recent = await db.scalar(
        select(ProposalEvent.id)
        .where(
            ProposalEvent.proposal_id == proposal_id,
            ProposalEvent.kind == EVENT_VIEWED,
            ProposalEvent.occurred_at >= since,
            ProposalEvent.ip_address.is_not_distinct_from(ip_address),
            ProposalEvent.user_agent.is_not_distinct_from(user_agent),
        )
        .limit(1)
    )
    if recent is not None:
        return False
    record_event(
        db,
        proposal_id,
        EVENT_VIEWED,
        actor_user_id=actor_user_id,
        actor_label=actor_label,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return True


async def list_events(db: AsyncSession, proposal_id: uuid.UUID) -> list[ProposalEvent]:
    result = await db.execute(
        select(ProposalEvent)
        .where(ProposalEvent.proposal_id == proposal_id)
        .order_by(ProposalEvent.occurred_at, ProposalEvent.created_at)
    )
    return list(result.scalars().all())


def event_read(event: ProposalEvent) -> ProposalEventRead:
    return ProposalEventRead(
        kind=event.kind,
        occurred_at=event.occurred_at,
        actor_label=event.actor_label,
        ip_address=event.ip_address,
        user_agent=event.user_agent,
        detail=event.detail,
    )


def _parse_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


async def build_certificate(db: AsyncSession, proposal: Proposal) -> ProposalCertificateRead:
    """The signed record, from the frozen snapshot rather than today's rows.
    409 until the proposal is signed."""
    signature = await db.scalar(select(ProposalSignature).where(ProposalSignature.proposal_id == proposal.id))
    if proposal.status != STATUS_SIGNED or signature is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal hasn't been signed yet")
    await ensure_document_record(db, proposal)
    assert proposal.document_snapshot is not None and proposal.document_hash is not None
    data = json.loads(proposal.document_snapshot)
    counter = await db.scalar(
        select(ProposalCountersignature).where(ProposalCountersignature.proposal_id == proposal.id)
    )

    return ProposalCertificateRead(
        proposal_id=proposal.id,
        agency_name=data["agency"]["name"] or "",
        title=data["title"],
        recipient_name=data["recipient_name"],
        recipient_email=data["recipient_email"],
        content=data["content"],
        currency=data["currency"],
        tax_rate_percent=data["tax_rate_percent"],
        subtotal_cents=data["subtotal_cents"],
        tax_cents=data["tax_cents"],
        total_cents=data["total_cents"],
        # Absent from v1 snapshots, which had no monthly lines.
        monthly_subtotal_cents=data.get("monthly_subtotal_cents", 0),
        monthly_tax_cents=data.get("monthly_tax_cents", 0),
        monthly_total_cents=data.get("monthly_total_cents", 0),
        valid_until=_parse_datetime(data["valid_until"]),
        sent_at=_parse_datetime(data["sent_at"]),
        package_name=(data.get("package") or {}).get("name"),
        line_items=[
            CertificateLineRead(
                description=line["description"],
                details=line["details"],
                quantity=line["quantity"],
                unit_price_cents=line["unit_price_cents"],
                amount_cents=line["amount_cents"],
                billing=line.get("billing", "one_time"),
                add_on=line.get("add_on", False),
            )
            for line in data["line_items"]
        ],
        attachments=[CertificateAttachmentRead(**item) for item in data["attachments"]],
        document_hash=proposal.document_hash,
        document_intact=snapshot_is_intact(proposal),
        signature_matches_document=signature.document_hash == proposal.document_hash,
        signature=CertificateSignatureRead(
            signer_name=signature.signer_name,
            signer_email=signature.signer_email,
            signature_text=signature.signature_text,
            signed_at=signature.signed_at,
            ip_address=signature.ip_address,
            user_agent=signature.user_agent,
            signed_via=signature.signed_via,
            consent_version=signature.consent_version,
            consent_text=signature.consent_text,
            document_hash=signature.document_hash,
        ),
        requires_countersign=proposal.requires_countersign,
        countersignature=(
            CertificateSignatureRead(
                signer_name=counter.signer_name,
                signer_email=counter.signer_email,
                signature_text=counter.signature_text,
                signed_at=counter.signed_at,
                ip_address=counter.ip_address,
                user_agent=counter.user_agent,
                signed_via="agency",
                consent_version=counter.consent_version,
                consent_text=counter.consent_text,
                document_hash=counter.document_hash,
            )
            if counter
            else None
        ),
        completed_at=proposal.completed_at,
        events=[event_read(event) for event in await list_events(db, proposal.id)],
        generated_at=datetime.now(UTC),
    )
