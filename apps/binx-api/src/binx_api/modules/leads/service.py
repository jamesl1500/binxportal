"""Leads service — a light CRM. A `Lead` is a prospect the agency is working;
`convert_lead` promotes one into a real `AgencyClient` (reusing
agencies/service.py::create_client). Every meaningful change appends a
`LeadEvent` to the lead's timeline. `analyze_lead` is the AI seam: it tries a
real Claude analysis via ai/service.py::analyze_lead_website (which fetches
the lead's own website) and falls back to a completeness heuristic on any AI
failure — not configured, over budget, or a malformed response — so a lead
is never left unanalyzed.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_CLIENTS
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
from binx_api.modules.ai import service as ai_service
from binx_api.modules.billing import service as billing_service
from binx_api.modules.leads.models import (
    EVENT_ANALYZED,
    EVENT_CONVERTED,
    EVENT_CREATED,
    EVENT_NOTE,
    EVENT_OWNER_CHANGED,
    EVENT_STATUS_CHANGED,
    LEAD_OPEN_STATUSES,
    Lead,
    LeadEvent,
)
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_TEAM
from binx_api.modules.users.models import User

# The most leads one bulk-analyze pass will touch, and one prospecting import.
BULK_ANALYZE_CAP = 25

# How many of those leads get analyzed concurrently — see analyze_open_leads.
# Bounds how hard one bulk-analyze click can burst against the Anthropic API.
_BULK_ANALYZE_CONCURRENCY = 5

_STATUS_LABELS = {
    "new": "New",
    "contacted": "Contacted",
    "qualified": "Qualified",
    "proposal": "Proposal",
    "won": "Won",
    "lost": "Lost",
}


def _now() -> datetime:
    return datetime.now(UTC)


async def _add_event(db: AsyncSession, lead: Lead, *, kind: str, body: str, actor: User | None) -> LeadEvent:
    event = LeadEvent(
        lead_id=lead.id,
        kind=kind,
        body=body,
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else None,
    )
    db.add(event)
    return event


# ---- Plan limits ----------------------------------------------------


async def _check_can_create_lead(db: AsyncSession, agency: Agency, *, adding: int = 1) -> None:
    """The plan's lead cap (billing/models.py::PLANS) applies to every lead the
    agency holds. Called on every creation path — the manual create dialog and
    the AI prospector import alike."""
    limits = await billing_service.get_plan_limits(db, agency.id)
    if limits.max_leads is None:
        return
    current = await db.execute(select(func.count()).select_from(Lead).where(Lead.agency_id == agency.id))
    billing_service.assert_within_limit(
        int(current.scalar_one()) + (adding - 1), limits.max_leads, resource="leads", plan_name=limits.name
    )


# ---- CRUD ------------------------------------------------------------


async def create_lead(
    db: AsyncSession,
    agency: Agency,
    *,
    actor: User | None,
    name: str,
    contact_name: str | None,
    contact_email: str | None,
    contact_phone: str | None,
    website: str | None,
    source: str,
    estimated_value_cents: int | None,
    notes: str | None,
) -> Lead:
    await _check_can_create_lead(db, agency)
    lead = Lead(
        agency_id=agency.id,
        name=name,
        contact_name=contact_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
        website=website,
        source=source,
        estimated_value_cents=estimated_value_cents,
        notes=notes,
        owner_id=actor.id if actor else None,
        last_activity_at=_now(),
    )
    db.add(lead)
    await db.flush()
    await _add_event(
        db, lead, kind=EVENT_CREATED, body=f"{actor.full_name if actor else 'Someone'} added this lead", actor=actor
    )
    await db.commit()
    await db.refresh(lead)
    return lead


async def list_leads(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    status_filter: str | None = None,
    owner_id: uuid.UUID | None = None,
    source: str | None = None,
) -> list[tuple[Lead, str | None, str | None]]:
    query = (
        select(Lead, User.full_name, AgencyClient.name)
        .outerjoin(User, User.id == Lead.owner_id)
        .outerjoin(AgencyClient, AgencyClient.id == Lead.converted_client_id)
        .where(Lead.agency_id == agency_id)
    )
    if status_filter:
        query = query.where(Lead.status == status_filter)
    if owner_id:
        query = query.where(Lead.owner_id == owner_id)
    if source:
        query = query.where(Lead.source == source)
    # Open leads first, then most-recently-worked.
    query = query.order_by(
        Lead.status.in_(("won", "lost")),
        Lead.last_activity_at.is_(None),
        Lead.last_activity_at.desc(),
        Lead.created_at.desc(),
    )
    result = await db.execute(query)
    return [(lead, owner_name, client_name) for lead, owner_name, client_name in result.all()]


async def get_lead_or_404(db: AsyncSession, agency_id: uuid.UUID, lead_id: uuid.UUID) -> Lead:
    result = await db.execute(select(Lead).where(Lead.id == lead_id, Lead.agency_id == agency_id))
    lead = result.scalar_one_or_none()
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return lead


async def converted_client_name(db: AsyncSession, lead: Lead) -> str | None:
    if lead.converted_client_id is None:
        return None
    client = await db.get(AgencyClient, lead.converted_client_id)
    return client.name if client else None


async def owner_name(db: AsyncSession, lead: Lead) -> str | None:
    if lead.owner_id is None:
        return None
    user = await db.get(User, lead.owner_id)
    return user.full_name if user else None


async def update_lead(
    db: AsyncSession,
    lead: Lead,
    *,
    name: str,
    contact_name: str | None,
    contact_email: str | None,
    contact_phone: str | None,
    website: str | None,
    source: str,
    estimated_value_cents: int | None,
    notes: str | None,
) -> Lead:
    lead.name = name
    lead.contact_name = contact_name
    lead.contact_email = contact_email
    lead.contact_phone = contact_phone
    lead.website = website
    lead.source = source
    lead.estimated_value_cents = estimated_value_cents
    lead.notes = notes
    lead.last_activity_at = _now()
    await db.commit()
    await db.refresh(lead)
    return lead


async def delete_lead(db: AsyncSession, lead: Lead) -> None:
    await db.delete(lead)
    await db.commit()


# ---- Pipeline ------------------------------------------------------


async def change_status(
    db: AsyncSession, lead: Lead, *, new_status: str, lost_reason: str | None, actor: User | None
) -> Lead:
    if new_status == lead.status:
        return lead
    previous = lead.status
    lead.status = new_status
    lead.lost_reason = lost_reason if new_status == "lost" else None
    lead.last_activity_at = _now()
    from_label = _STATUS_LABELS.get(previous, previous)
    to_label = _STATUS_LABELS.get(new_status, new_status)
    detail = f" — {lost_reason}" if new_status == "lost" and lost_reason else ""
    await _add_event(
        db,
        lead,
        kind=EVENT_STATUS_CHANGED,
        body=f"Status changed from {from_label} to {to_label}{detail}",
        actor=actor,
    )
    await db.commit()
    await db.refresh(lead)
    return lead


async def assign_owner(
    db: AsyncSession, lead: Lead, agency_id: uuid.UUID, *, owner_id: uuid.UUID | None, actor: User | None
) -> Lead:
    if owner_id == lead.owner_id:
        return lead

    new_owner: User | None = None
    if owner_id is not None:
        member = await db.execute(
            select(AgencyMember.id).where(AgencyMember.agency_id == agency_id, AgencyMember.user_id == owner_id)
        )
        if member.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That person isn't a member of this agency")
        new_owner = await db.get(User, owner_id)

    lead.owner_id = owner_id
    lead.last_activity_at = _now()
    label = new_owner.full_name if new_owner else "Unassigned"
    await _add_event(db, lead, kind=EVENT_OWNER_CHANGED, body=f"Owner set to {label}", actor=actor)
    await db.commit()
    await db.refresh(lead)

    if new_owner is not None:
        await notifications_service.notify(
            db,
            user_id=new_owner.id,
            category=CATEGORY_TEAM,
            event_type="lead_assigned",
            title=f"You now own the lead {lead.name}",
            body=f"{actor.full_name if actor else 'A teammate'} assigned it to you.",
            link=f"/leads/{lead.id}",
            agency_id=agency_id,
            actor=actor,
        )
    return lead


async def add_note(db: AsyncSession, lead: Lead, *, body: str, actor: User | None) -> LeadEvent:
    lead.last_activity_at = _now()
    event = await _add_event(db, lead, kind=EVENT_NOTE, body=body.strip(), actor=actor)
    await db.commit()
    await db.refresh(event)
    return event


async def list_events(db: AsyncSession, lead_id: uuid.UUID) -> list[LeadEvent]:
    result = await db.execute(
        select(LeadEvent).where(LeadEvent.lead_id == lead_id).order_by(LeadEvent.created_at.desc())
    )
    return list(result.scalars().all())


# ---- Convert -----------------------------------------------------


async def convert_lead(db: AsyncSession, lead: Lead, agency: Agency, *, actor: User | None) -> AgencyClient:
    if lead.converted_client_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This lead has already been converted")

    client = await agencies_service.create_client(
        db,
        agency,
        name=lead.name,
        primary_contact_name=lead.contact_name,
        primary_contact_email=lead.contact_email,
        primary_contact_phone=lead.contact_phone,
        website=lead.website,
        notes=lead.notes,
    )

    now = _now()
    lead.converted_client_id = client.id
    lead.converted_at = now
    lead.status = "won"
    lead.last_activity_at = now
    await _add_event(
        db,
        lead,
        kind=EVENT_CONVERTED,
        body=f"Converted to the client {client.name}",
        actor=actor,
    )
    await db.commit()
    await db.refresh(lead)

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_CLIENTS,
        event_type="lead_converted",
        summary=f"{actor.full_name if actor else 'Someone'} converted the lead {lead.name} to a client",
        actor=actor,
        target_type="client",
        target_id=client.id,
        target_name=client.name,
    )
    return client


# ---- AI seam ----------------------------------------------------


def _is_sparse(lead: Lead) -> bool:
    """A record with no website and nothing else to go on — an AI call adds
    nothing here, so analyze_lead skips straight to the heuristic."""
    return not lead.website and not any(
        (lead.contact_email, lead.contact_phone, lead.estimated_value_cents, (lead.notes or "").strip())
    )


async def _run_analysis(
    db: AsyncSession, lead: Lead, agency: Agency, *, actor: User | None, lock: asyncio.Lock | None = None
) -> ai_service.LeadAnalysis:
    if _is_sparse(lead):
        return _heuristic_analysis(lead)
    try:
        return await ai_service.analyze_lead_website(db, lead, agency, actor=actor, lock=lock)
    except Exception:
        return _heuristic_analysis(lead)


def _apply_analysis(lead: Lead, analysis: ai_service.LeadAnalysis) -> None:
    lead.score = analysis.score
    lead.ai_summary = analysis.summary
    lead.ai_talking_points = json.dumps(analysis.talking_points) if analysis.talking_points else None
    lead.ai_next_step = analysis.next_step
    lead.ai_fit = analysis.fit
    lead.ai_analyzed_at = _now()
    lead.last_activity_at = lead.ai_analyzed_at


async def analyze_lead(db: AsyncSession, lead: Lead, *, actor: User | None) -> Lead:
    """Score + summarise one lead. Tries a real Claude analysis (fetching the
    lead's website when one is on file); falls back to a completeness heuristic
    on any AI failure — or straight away for a sparse record — so this endpoint
    never hard-fails."""
    agency = await db.get(Agency, lead.agency_id)
    assert agency is not None  # FK guarantees it

    analysis = await _run_analysis(db, lead, agency, actor=actor)
    _apply_analysis(lead, analysis)
    await _add_event(db, lead, kind=EVENT_ANALYZED, body=f"Analyzed — score {analysis.score}/100", actor=actor)
    await db.commit()
    await db.refresh(lead)
    return lead


@dataclass
class BulkAnalyzeResult:
    analyzed: int = 0
    skipped: int = 0
    leads: list[Lead] = field(default_factory=list)


def _needs_analysis(lead: Lead) -> bool:
    if lead.ai_analyzed_at is None:
        return True
    return lead.last_activity_at is not None and lead.ai_analyzed_at < lead.last_activity_at


async def analyze_open_leads(db: AsyncSession, agency: Agency, *, actor: User | None) -> BulkAnalyzeResult:
    """Analyze every open lead that's unanalyzed or stale (its last activity is
    newer than its last analysis), capped at BULK_ANALYZE_CAP. Runs up to
    `_BULK_ANALYZE_CONCURRENCY` leads' Claude calls concurrently — the real
    bottleneck (the network round trip, more with web_fetch) parallelizes;
    every DB-touching step (the budget check and usage logging inside
    ai_client.complete(), both awaited on this one shared AsyncSession, which
    is not safe for concurrent access) stays serialized behind `lock`. If the
    AI budget is already *exhausted* (429), stop early rather than quietly
    heuristic-scoring the whole pipeline; when AI simply isn't configured
    (503), fall through to the heuristic per-lead like single analyze does."""
    result = await db.execute(
        select(Lead)
        .where(Lead.agency_id == agency.id, Lead.status.in_(LEAD_OPEN_STATUSES))
        .order_by(Lead.last_activity_at.desc().nullslast(), Lead.created_at.desc())
    )
    candidates = [lead for lead in result.scalars().all() if _needs_analysis(lead)][:BULK_ANALYZE_CAP]

    out = BulkAnalyzeResult()
    budget_ok = True
    if candidates:
        try:
            from binx_api.modules.ai import client as ai_client

            await ai_client.check_budget_and_rate(db, agency.id, actor.id if actor else None)
        except HTTPException as exc:
            budget_ok = exc.status_code != 429

    lock = asyncio.Lock()
    semaphore = asyncio.Semaphore(_BULK_ANALYZE_CONCURRENCY)

    async def _bounded(lead: Lead) -> None:
        async with semaphore:
            if not budget_ok and not _is_sparse(lead):
                out.skipped += 1
                return
            analysis = await _run_analysis(db, lead, agency, actor=actor, lock=lock)
            _apply_analysis(lead, analysis)
            await _add_event(db, lead, kind=EVENT_ANALYZED, body=f"Analyzed — score {analysis.score}/100", actor=actor)
            out.analyzed += 1
            out.leads.append(lead)

    await asyncio.gather(*(_bounded(lead) for lead in candidates))

    await db.commit()
    for lead in out.leads:
        await db.refresh(lead)
    return out


# ---- AI prospector (find + import leads) ---------------------------


@dataclass
class ImportResult:
    imported: list[Lead] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)


def _host(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlparse(url if "//" in url else f"//{url}")
    host = (parsed.netloc or parsed.path).lower().split("/")[0]
    return host[4:] if host.startswith("www.") else host or None


async def import_prospects(
    db: AsyncSession, agency: Agency, *, actor: User | None, candidates: list[dict]
) -> ImportResult:
    """Create leads (source="ai_generated") from reviewed prospector
    candidates, skipping any that duplicate an existing lead by website host or
    name. Plan lead cap is checked up front for the whole batch and again
    per-row by create_lead."""
    out = ImportResult()
    fresh = [c for c in candidates if str(c.get("name") or "").strip()]
    if not fresh:
        return out

    await _check_can_create_lead(db, agency, adding=len(fresh))

    existing = (await db.execute(select(Lead.name, Lead.website).where(Lead.agency_id == agency.id))).all()
    seen_names = {name.strip().lower() for name, _ in existing}
    seen_hosts = {h for _, site in existing if (h := _host(site))}

    for cand in fresh:
        name = str(cand["name"]).strip()
        host = _host(cand.get("website"))
        if name.lower() in seen_names or (host and host in seen_hosts):
            out.skipped.append({"name": name, "reason": "Already a lead"})
            continue
        lead = await create_lead(
            db,
            agency,
            actor=actor,
            name=name,
            contact_name=None,
            contact_email=(cand.get("contact_email") or None),
            contact_phone=(cand.get("contact_phone") or None),
            website=(cand.get("website") or None),
            source="ai_generated",
            estimated_value_cents=cand.get("estimated_value_cents"),
            notes=(f"AI prospector: {cand['rationale']}" if cand.get("rationale") else None),
        )
        out.imported.append(lead)
        seen_names.add(name.lower())
        if host:
            seen_hosts.add(host)
    return out


def _heuristic_analysis(lead: Lead) -> ai_service.LeadAnalysis:
    """Scores on how complete the record is and writes a templated summary —
    the fallback analyze_lead uses whenever the real AI analysis isn't
    available (no key configured, budget exhausted, or a parse failure)."""
    has_website = bool(lead.website)
    has_email = bool(lead.contact_email)
    has_phone = bool(lead.contact_phone)
    has_value = lead.estimated_value_cents is not None and lead.estimated_value_cents > 0
    has_notes = bool(lead.notes and lead.notes.strip())
    worked = lead.status != "new"

    score = min(
        100,
        has_website * 25 + has_email * 20 + has_phone * 10 + has_value * 15 + worked * 15 + has_notes * 15,
    )

    missing = [
        label
        for present, label in (
            (has_website, "a website"),
            (has_email, "a contact email"),
            (has_phone, "a phone number"),
            (has_value, "an estimated value"),
        )
        if not present
    ]
    site = lead.website or "no website on file"
    summary = (
        f"Heuristic read of {lead.name} ({site}). "
        f"Completeness score {score}/100. "
        + ("Record looks solid. " if not missing else f"Still missing {', '.join(missing)}. ")
        + " (Heuristic read — AI analysis wasn't available for this one.)"
    )
    talking_points = [f"Fill in {m}" for m in missing]
    next_step = "Move it to Qualified and book a call." if worked else "Make first contact and log a note."
    fit = "strong" if score >= 70 else "moderate" if score >= 40 else "weak"
    return ai_service.LeadAnalysis(
        score=score, summary=summary, talking_points=talking_points, next_step=next_step, fit=fit
    )
