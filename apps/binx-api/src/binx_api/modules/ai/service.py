"""The AI features, each a thin prompt-builder over the shared
ai/client.py::complete / complete_stream. Nothing here talks to Anthropic
directly.

- analyze_lead_website / find_prospects / suggest_project_tasks —
  structured JSON output. analyze_lead_website is used by leads/service.py
  (which owns the heuristic fallback when it raises); suggest_project_tasks
  returns suggestions for the caller to review before
  projects/service.py::bulk_create_board writes anything.
- generate_dashboard_briefing / generate_project_summary /
  generate_invoice_reminder / generate_lead_followup /
  generate_message_reply — plain-text drafts.
- assistant_reply / assistant_reply_stream — the "Ask AI" manual
  tool-calling loop over agency-scoped read tools plus, when the member
  allows it, action tools that change data on their behalf (recorded as
  AiActions, each held for the member's Approve unless they opted out);
  the streaming variant yields text deltas and actions as they happen
  instead of returning once.
"""

from __future__ import annotations

import json
import uuid
from asyncio import Lock
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
from binx_api.modules.ai import client as ai_client
from binx_api.modules.ai.models import (
    ACTION_APPLIED,
    ACTION_DECLINED,
    ACTION_FAILED,
    ACTION_PENDING,
    FEATURE_ASSISTANT,
    FEATURE_DASHBOARD_BRIEFING,
    FEATURE_INVOICE_REMINDER,
    FEATURE_LEAD_ANALYSIS,
    FEATURE_LEAD_FOLLOWUP,
    FEATURE_LEAD_GENERATION,
    FEATURE_MESSAGE_REPLY,
    FEATURE_PROJECT_SUMMARY,
    FEATURE_PROJECT_TASKS,
    PREFERENCE_DEFAULTS,
    ROLE_ASSISTANT,
    ROLE_USER,
    AiAction,
    AiConversation,
    AiConversationMessage,
    AiUserPreferences,
    DashboardBriefing,
)
from binx_api.modules.dashboard import service as dashboard_service
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import STATUS_SENT, Invoice
from binx_api.modules.leads import places as places_client
from binx_api.modules.leads.models import LEAD_OPEN_STATUSES, LEAD_STATUSES, Lead
from binx_api.modules.leads.schemas import LeadCreate, LeadNoteCreate, LeadStatusUpdate
from binx_api.modules.messaging import service as messaging_service
from binx_api.modules.messaging.models import MESSAGE_USER, SENDER_CLIENT, Conversation
from binx_api.modules.messaging.schemas import MessageRead
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import Project, project_statuses
from binx_api.modules.projects.schemas import TaskCreate, TaskUpdate
from binx_api.modules.users.models import User

MAX_ASSISTANT_ITERATIONS = 6


def _money(cents: int, currency: str) -> str:
    return f"{cents / 100:,.2f} {currency}"


# ---- Lead analysis --------------------------------------------------


@dataclass
class LeadAnalysis:
    """The structured result of scoring one lead. ``leads/service.py`` persists
    each field on the Lead row; ``_heuristic_analysis`` builds the same shape
    when the AI call isn't available."""

    score: int
    summary: str
    talking_points: list[str] = field(default_factory=list)
    next_step: str | None = None
    fit: str | None = None  # strong | moderate | weak


_LEAD_ANALYSIS_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            # No `minimum`/`maximum` here — the API rejects bounds on integer
            # schema properties ("...are not supported"). Clamped client-side
            # below instead.
            "score": {"type": "integer", "description": "0-100"},
            "fit": {"type": "string", "enum": ["strong", "moderate", "weak"]},
            "summary": {"type": "string"},
            "talking_points": {"type": "array", "items": {"type": "string"}},
            "next_step": {"type": "string"},
        },
        "required": ["score", "fit", "summary", "talking_points", "next_step"],
        "additionalProperties": False,
    },
}


async def analyze_lead_website(
    db: AsyncSession, lead: Lead, agency: Agency, *, actor: User | None, lock: Lock | None = None
) -> LeadAnalysis:
    """Score a lead 0-100, read its fit, and write a short summary + talking
    points + next step — fetching the lead's own website for real signal when
    one is on file. Tuned for speed: `effort="low"` and a tight token budget,
    since structured scoring doesn't need deep reasoning. Raises on any AI
    failure (not configured, over budget, malformed response) — the caller
    (leads/service.py::analyze_lead) catches that and falls back to the
    completeness heuristic, so a lead is never left unanalyzed.

    ``lock`` is a passthrough to ``ai_client.complete()`` — see its
    docstring. Only ``leads/service.py::analyze_open_leads``'s bulk path
    passes one, to run several of these concurrently on one shared
    ``AsyncSession``."""
    contact_bits = ", ".join(filter(None, [lead.contact_name, lead.contact_email, lead.contact_phone]))
    value = f"${lead.estimated_value_cents / 100:,.0f}" if lead.estimated_value_cents else "unknown"

    prompt = (
        f'You\'re helping the sales team at "{agency.name}" (a services agency) evaluate a sales lead.\n\n'
        f"Lead: {lead.name}\n"
        f"Website: {lead.website or 'none on file'}\n"
        f"Contact: {contact_bits or 'none on file'}\n"
        f"Estimated deal value: {value}\n"
        f"Pipeline status: {lead.status}\n"
        f"Notes on file: {lead.notes or 'none'}\n\n"
    )
    tools = None
    if lead.website:
        prompt += (
            f"You MUST call the web_fetch tool exactly once on {lead.website} before answering. Use what "
            "it actually returns — what the company does, who they serve, any signal of budget or "
            "urgency — to ground your analysis. If the fetch fails or the site doesn't resolve, say so "
            "plainly rather than guessing. Don't invent details the site doesn't support.\n\n"
        )
        # The plain (non-dynamic-filtering) web_fetch: dynamic filtering
        # (web_fetch_20260209) routes the fetch through a code-execution
        # sandbox the model can choose to skip, which was silently failing
        # to fetch at all some of the time and, when it did fetch, took
        # 2-5x longer (a code container spin-up on top of the fetch) for a
        # single-page read that never needed filtering in the first place.
        # `max_content_tokens` caps a sprawling site so one fetch can't
        # dominate latency or cost.
        tools = [{"type": "web_fetch_20250910", "name": "web_fetch", "max_uses": 1, "max_content_tokens": 4000}]
    prompt += (
        "Score this lead 0-100 on how promising it is to pursue (fit, budget signal, and how "
        "complete the record is), give an overall fit of strong/moderate/weak, write a 2-3 "
        "sentence summary, list 2-4 short talking points for the first call, and suggest one "
        "concrete next step."
    )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_LEAD_ANALYSIS,
        system="You are a sharp, concise B2B sales analyst. Be specific, never generic filler.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=700,
        effort="low",
        tools=tools,
        response_format=_LEAD_ANALYSIS_FORMAT,
        lock=lock,
    )
    data = json.loads(result.text)
    fit = str(data.get("fit") or "").strip().lower()
    return LeadAnalysis(
        score=max(0, min(100, int(data["score"]))),
        summary=str(data["summary"]).strip(),
        talking_points=[str(p).strip() for p in (data.get("talking_points") or []) if str(p).strip()],
        next_step=(str(data.get("next_step") or "").strip() or None),
        fit=fit if fit in ("strong", "moderate", "weak") else None,
    )


# ---- Lead generation (AI prospector) --------------------------------


@dataclass
class ProspectCandidate:
    name: str
    website: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    estimated_value_cents: int | None = None
    rationale: str | None = None
    # "google_places" | "web_search" | "both" — which source(s) surfaced this
    # candidate. Defaults to "web_search" since that's the only source when
    # places.is_configured() is False. See find_prospects.
    source: str = "web_search"


_PROSPECT_SOURCES = ("google_places", "web_search", "both")

_PROSPECTS_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "website": {"type": "string"},
                        "contact_email": {"type": "string"},
                        "contact_phone": {"type": "string"},
                        "estimated_value_cents": {"type": "integer"},
                        "rationale": {"type": "string"},
                        "source": {"type": "string", "enum": list(_PROSPECT_SOURCES)},
                    },
                    "required": ["name", "rationale", "source"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["candidates"],
        "additionalProperties": False,
    },
}


def _places_query(brief: dict) -> str:
    """Folds industry/location/radius into one Places Text Search query
    string — see leads/models.py::LeadSearchCriteria's note on why radius
    isn't a real geo filter here."""
    parts = [str(brief.get("industry") or "companies").strip()]
    if brief.get("keywords"):
        parts.append(f"that need {brief['keywords']}")
    if brief.get("location"):
        parts.append(f"in {brief['location']}")
    if brief.get("radius_miles"):
        parts.append(f"within {brief['radius_miles']} miles")
    return " ".join(parts)


async def find_prospects(
    db: AsyncSession, agency: Agency, *, actor: User | None, brief: dict
) -> list[ProspectCandidate]:
    """Find real companies matching a prospecting brief, using Google Places
    (when configured — see places.py) as a verified ground-truth source and
    Claude web search to add rationale/estimated value and fill in beyond
    Places' coverage. Returns candidates for the caller to review — nothing
    is persisted here. Raises like the other AI features on any failure."""
    count = max(1, min(10, int(brief.get("count") or 5)))

    places_results = await places_client.search_places(query=_places_query(brief), max_results=count * 2)

    lines = [
        f'Agency: "{agency.name}" (a services agency looking for new clients).',
        f"Industry / vertical: {brief.get('industry') or 'any'}",
        f"Location: {brief.get('location') or 'any'}"
        + (f" (within {brief['radius_miles']} miles)" if brief.get("radius_miles") else ""),
        f"Company size: {brief.get('company_size') or 'any'}",
        f"Keywords / what they'd need: {brief.get('keywords') or '(none given)'}",
        f"How many to return: {count}",
    ]
    prompt = (
        "Find real companies that would be a good fit as prospective clients for this agency. "
        "Only include companies you actually find (via the list below or web search), with their "
        "real website URL. Never invent contact details — leave email/phone out unless a source "
        "surfaces them. Give each a one-sentence rationale for why they fit, and a rough estimated "
        "first-project value in cents if you can justify one. If nothing turns up, return fewer "
        'rather than padding with guesses. Tag each candidate\'s "source" as "google_places", '
        '"web_search", or "both" (Places-listed and confirmed/enriched via search).\n\n' + "\n".join(lines)
    )
    if places_results:
        listed = "\n".join(
            f"- {p.name}" + (f" — {p.website}" if p.website else "") + (f" ({p.address})" if p.address else "")
            for p in places_results
        )
        prompt += (
            "\n\nGoogle Places already found these real businesses matching the brief — verified names, "
            "not hallucinated. Prefer these: pick the ones that best fit and tag them "
            'source="google_places" (or "both" if you also confirm/enrich them via web search). Only use '
            "web search to find additional candidates if this list is too short for the count requested, "
            f"or empty.\n\n{listed}"
        )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_LEAD_GENERATION,
        system="You are a B2B prospecting researcher. Ground every company in real search results.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2500,
        effort="medium",
        tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}],
        response_format=_PROSPECTS_FORMAT,
        fast=True,
    )

    def _trimmed(raw: dict, key: str, length: int) -> str | None:
        value = str(raw.get(key) or "").strip()[:length]
        return value or None

    data = json.loads(result.text)
    candidates: list[ProspectCandidate] = []
    for raw in (data.get("candidates") or [])[:count]:
        name = _trimmed(raw, "name", 255)
        if not name:
            continue
        value = raw.get("estimated_value_cents")
        source = str(raw.get("source") or "").strip().lower()
        candidates.append(
            ProspectCandidate(
                name=name,
                website=_trimmed(raw, "website", 2048),
                contact_email=_trimmed(raw, "contact_email", 255),
                contact_phone=_trimmed(raw, "contact_phone", 32),
                estimated_value_cents=max(0, int(value)) if isinstance(value, int | float) else None,
                rationale=_trimmed(raw, "rationale", 1000),
                source=source if source in _PROSPECT_SOURCES else "web_search",
            )
        )
    return candidates


# ---- Lead follow-up email draft ---------------------------------------


async def generate_lead_followup(db: AsyncSession, lead: Lead, agency: Agency, *, actor: User | None) -> str:
    """Draft a follow-up email for a lead still in play. Structurally the
    same as generate_invoice_reminder: a guard, a plain-text prompt built
    from what's already on file, one fast-tier call. Grounds the draft in
    any existing analyze_lead_website output (ai_summary/ai_next_step)
    without triggering a second AI call for it."""
    if lead.status not in LEAD_OPEN_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This lead is closed — no follow-up needed.")

    contact_bits = ", ".join(filter(None, [lead.contact_name, lead.contact_email, lead.contact_phone]))
    last_activity = lead.last_activity_at.date().isoformat() if lead.last_activity_at else "no activity logged"

    prompt = (
        f'Draft a follow-up email for the sales lead "{lead.name}" on behalf of "{agency.name}".\n'
        f"Contact: {contact_bits or 'none on file'}\n"
        f"Pipeline status: {lead.status}\n"
        f"Last activity: {last_activity}\n"
        f"Notes on file: {lead.notes or 'none'}\n"
    )
    if lead.ai_summary:
        prompt += f"Prior analysis summary: {lead.ai_summary}\n"
    if lead.ai_next_step:
        prompt += f"Suggested next step: {lead.ai_next_step}\n"
    prompt += (
        "\nWrite a brief, warm, no-pressure check-in email — professional, not pushy. Reference what's "
        "known above only; don't invent specifics. Write only the email body — no subject line, no "
        "signature block."
    )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_LEAD_FOLLOWUP,
        system="You write concise, warm follow-up emails for a B2B sales pipeline.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        effort="low",
        fast=True,
    )
    return result.text


# ---- Dashboard briefing ----------------------------------------------


async def generate_dashboard_briefing(db: AsyncSession, agency: Agency, user: User) -> str:
    # Local import: leads/service.py imports ai/service.py for the analyze_lead
    # seam, so importing leads.service at module level here would be circular.
    from binx_api.modules.leads import service as leads_service

    my_work = await dashboard_service.my_work(db, agency.id, user.id)
    lead_rows = await leads_service.list_leads(db, agency.id)
    open_leads = [lead for lead, _owner, _client in lead_rows if lead.status in LEAD_OPEN_STATUSES]
    overdue_invoices = await invoicing_service.list_invoices(db, agency.id, status_filter="overdue")
    recent = await activity_service.list_agency_activity(db, agency.id, viewer_is_admin=True, limit=8)

    lines = [
        f"{user.full_name}'s open tasks: {my_work.total_open} total, "
        f"{my_work.overdue_count} overdue, {my_work.due_soon_count} due within 7 days.",
    ]
    for task in my_work.tasks[:5]:
        due = task.due_date.isoformat() if task.due_date else "no due date"
        lines.append(f"  - {task.title} ({task.project_name}, due {due}{', OVERDUE' if task.overdue else ''})")

    lines.append(f"\nOpen leads: {len(open_leads)}.")
    for lead in open_leads[:5]:
        score = f"score {lead.score}" if lead.score is not None else "unscored"
        lines.append(f"  - {lead.name} ({lead.status}, {score})")

    lines.append(f"\nOverdue invoices: {len(overdue_invoices)}.")
    for invoice, client_name, _project_name in overdue_invoices[:5]:
        due_cents = invoice.total_cents - invoice.amount_paid_cents
        overdue_since = invoice.due_date.isoformat()
        amount = _money(due_cents, invoice.currency)
        lines.append(f"  - {invoice.number} for {client_name}: {amount} overdue since {overdue_since}")

    if recent:
        lines.append("\nRecent agency activity:")
        for entry in recent[:6]:
            lines.append(f"  - {entry.summary}")

    fact_sheet = "\n".join(lines)
    result = await ai_client.complete(
        db,
        agency.id,
        user.id,
        feature=FEATURE_DASHBOARD_BRIEFING,
        system=(
            "You write short daily briefings for someone at a creative/marketing agency, based only "
            "on the facts given. Be warm but efficient — no filler, no restating the obvious."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Here's today's state of things for {user.full_name} at {agency.name}:\n\n{fact_sheet}\n\n"
                    "Write a 3-5 sentence briefing, then a short bulleted 'Do next' list (2-4 items) of "
                    "the most important things to act on today. Only reference facts given above."
                ),
            }
        ],
        max_tokens=700,
        effort="medium",
        fast=True,
    )
    return result.text


async def get_dashboard_briefing(db: AsyncSession, agency: Agency, user: User, *, force: bool = False) -> str:
    """Cache-aware wrapper around ``generate_dashboard_briefing`` — one row
    per (agency, member, UTC day) in ``dashboard_briefings``. The dashboard
    page used to call Claude fresh on every render; this is what makes the
    second-and-later load in a day free, instant, and silent against the
    agency's AI budget. ``force=True`` (the Refresh button) regenerates and
    overwrites today's row regardless of whether one already exists."""
    today = datetime.now(UTC).date()
    existing = (
        await db.execute(
            select(DashboardBriefing).where(
                DashboardBriefing.agency_id == agency.id,
                DashboardBriefing.user_id == user.id,
                DashboardBriefing.briefing_date == today,
            )
        )
    ).scalar_one_or_none()
    if existing is not None and not force:
        return existing.content

    text = await generate_dashboard_briefing(db, agency, user)
    if existing is not None:
        existing.content = text
    else:
        db.add(DashboardBriefing(agency_id=agency.id, user_id=user.id, briefing_date=today, content=text))
    await db.commit()
    return text


# ---- Project summary ---------------------------------------------------


async def generate_project_summary(db: AsyncSession, project: Project, agency: Agency, *, actor: User | None) -> str:
    board = await projects_service.get_project_board(db, project.id)
    column_lines = []
    for task_list, tasks in board:
        titles = [task.title for task, *_rest in tasks]
        shown = ", ".join(titles[:12]) if titles else "(empty)"
        column_lines.append(f"{task_list.name} ({len(titles)}): {shown}")

    prompt = (
        f'Write a short, client-ready status update for the project "{project.name}" '
        f"(internal status: {project.status}).\n"
        f"Description: {project.description or 'none on file'}\n\n"
        "Board:\n" + "\n".join(column_lines) + "\n\n"
        "Write 3-5 sentences a client would be glad to receive: what's been done, what's in "
        "progress, and what's coming next. Prose only — no headers, no bullet points. Don't invent "
        "specifics beyond what's listed above."
    )
    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_PROJECT_SUMMARY,
        system="You write clear, warm client-facing project updates for a creative/marketing agency.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
        effort="medium",
        fast=True,
    )
    return result.text


# ---- Project starter task list ----------------------------------------


@dataclass
class TaskSuggestion:
    title: str
    description: str | None = None


@dataclass
class TaskListSuggestion:
    name: str
    tasks: list[TaskSuggestion] = field(default_factory=list)


_PROJECT_TASKS_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "lists": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "tasks": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "description": {"type": "string"},
                                },
                                "required": ["title"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["name", "tasks"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["lists"],
        "additionalProperties": False,
    },
}


async def suggest_project_tasks(
    db: AsyncSession, project: Project, agency: Agency, *, actor: User | None
) -> list[TaskListSuggestion]:
    """Propose a starter kanban board (columns + cards) for a freshly created
    project, from just its name/description — the opposite direction of
    generate_project_summary (propose structure instead of summarizing
    existing work). Returns suggestions for the caller to review/edit; never
    writes to the DB itself (see projects/service.py::bulk_create_board for
    that)."""
    prompt = (
        f'Propose a starter kanban task board for the project "{project.name}" at "{agency.name}" '
        "(a services agency).\n"
        f"Description: {project.description or 'none on file'}\n\n"
        "Suggest 2-4 columns (e.g. a typical workflow for this kind of project) and, under each, "
        "3-6 concrete starter tasks with short titles and a one-sentence description each. Keep it "
        "practical and specific to what's described above — don't pad with generic boilerplate tasks "
        "if the description doesn't support them."
    )
    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_PROJECT_TASKS,
        system="You are a delivery lead at a creative/marketing agency, setting up new project boards.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        effort="low",
        response_format=_PROJECT_TASKS_FORMAT,
        fast=True,
    )
    data = json.loads(result.text)
    lists: list[TaskListSuggestion] = []
    for raw_list in data.get("lists") or []:
        name = str(raw_list.get("name") or "").strip()[:100]
        if not name:
            continue
        tasks = []
        for raw_task in raw_list.get("tasks") or []:
            title = str(raw_task.get("title") or "").strip()[:255]
            if not title:
                continue
            description = str(raw_task.get("description") or "").strip()[:4096] or None
            tasks.append(TaskSuggestion(title=title, description=description))
        if tasks:
            lists.append(TaskListSuggestion(name=name, tasks=tasks))
    return lists


# ---- Invoice reminder ----------------------------------------------


async def generate_invoice_reminder(db: AsyncSession, invoice: Invoice, agency: Agency, *, actor: User | None) -> str:
    if invoice.status != STATUS_SENT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only a sent invoice can get a reminder drafted.")

    client = await db.get(AgencyClient, invoice.client_id)
    client_name = client.name if client else "the client"
    today = datetime.now(UTC).date()
    days_overdue = (today - invoice.due_date).days
    due_cents = invoice.total_cents - invoice.amount_paid_cents

    prompt = (
        f"Draft a payment reminder email for invoice {invoice.number} from {agency.name} to {client_name}.\n"
        f"Amount due: {_money(due_cents, invoice.currency)}\n"
        f"Due date: {invoice.due_date.isoformat()}"
        + (f" — {days_overdue} day{'s' if days_overdue != 1 else ''} overdue" if days_overdue > 0 else " (not yet due)")
        + "\n\n"
        "Write a friendly-but-firm reminder: professional, brief, no guilt-tripping. State the amount "
        "and due date plainly, ask clearly for payment, and offer to answer any questions. Write only "
        "the email body — no subject line, no signature block."
    )
    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_INVOICE_REMINDER,
        system="You write concise, professional payment-reminder emails on behalf of a small agency.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        effort="low",
        fast=True,
    )
    return result.text


# ---- Message reply draft ------------------------------------------------


async def generate_message_reply(
    db: AsyncSession, conversation: Conversation, agency: Agency, *, actor: User | None
) -> str:
    """Draft the actor's next message in a conversation — a reply to the most
    recent message someone else wrote, client or teammate. Guard: 400 when
    nobody else has written anything yet (an empty thread, or only the
    actor's own messages) — mirrors generate_invoice_reminder's guard shape.
    System messages ("X added Y") and deleted messages are ignored throughout.
    Reuses messaging/service.py::list_messages wholesale for the history
    fetch."""
    history = [
        message
        for message in await messaging_service.list_messages(db, conversation, limit=15, before=None)
        if message.message_type == MESSAGE_USER and message.deleted_at is None
    ]
    actor_id = actor.id if actor else None
    latest = next((message for message in reversed(history) if message.sender_id != actor_id), None)
    if latest is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "There's no message to reply to yet.")

    def _speaker(message: MessageRead) -> str:
        if message.sender_id == actor_id:
            return "You"
        if message.sender_kind == SENDER_CLIENT:
            return f"Client ({message.sender_name})"
        return message.sender_name

    lines = [f"{_speaker(message)}: {message.body}" for message in history]
    to_client = latest.sender_kind == SENDER_CLIENT
    prompt = (
        f'Draft your next message in this conversation at "{agency.name}", replying to the most recent '
        f"message from {'the client' if to_client else latest.sender_name}.\n\n"
        "Conversation so far (oldest first):\n" + "\n".join(lines) + "\n\n"
        f"Write a {'warm, professional' if to_client else 'friendly, concise'} reply that directly "
        "addresses that message, taking into account anything you've already said since. "
        "Don't invent facts not present above. Write only the message body — no signature block."
    )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_MESSAGE_REPLY,
        system="You write clear, warm messages for a team member at a creative/marketing agency.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
        effort="low",
        fast=True,
    )
    return result.text


# ---- Ask AI assistant ------------------------------------------------

_ASSISTANT_TOOLS = [
    {
        "name": "search_leads",
        "description": "Search this agency's sales leads (prospects not yet converted to clients).",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Case-insensitive substring to match against the name"},
                "status": {"type": "string", "enum": LEAD_STATUSES},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "search_clients",
        "description": "Search this agency's clients.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Case-insensitive substring to match against the name"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "search_projects",
        "description": "Search this agency's projects.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Case-insensitive substring to match against the name"},
                "status": {"type": "string", "enum": project_statuses},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "search_invoices",
        "description": "Search this agency's invoices, including which are overdue or partially paid.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["draft", "sent", "paid", "void", "overdue", "partial"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "get_project_board",
        "description": "A project's kanban board: its columns (with ids) and the tasks in each (with ids, "
        "assignee, and due date). Use it before creating or changing a task.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string", "description": "An id from search_projects"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "list_team_members",
        "description": "This agency's team members, with their ids — for assigning tasks.",
        "input_schema": {"type": "object", "properties": {}},
    },
]

# Tools that change data. Never executed directly by the tool loop — they go
# through _handle_action_call, which records an AiAction and (unless the
# member opted out of confirmations) waits for their Approve. Every one maps
# onto a service function a plain agency member can already call through the
# API, so the assistant can never do more than the member could by hand.
_ACTION_TOOLS = [
    {
        "name": "create_lead",
        "description": "Create a new sales lead.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Company or person name"},
                "contact_name": {"type": "string"},
                "contact_email": {"type": "string"},
                "contact_phone": {"type": "string"},
                "website": {"type": "string"},
                "estimated_value_cents": {"type": "integer", "description": "Estimated deal value, in cents"},
                "notes": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_lead_status",
        "description": "Move a lead to a different pipeline status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "An id from search_leads"},
                "status": {"type": "string", "enum": LEAD_STATUSES},
                "lost_reason": {"type": "string", "description": "Why it was lost — only for status 'lost'"},
            },
            "required": ["lead_id", "status"],
        },
    },
    {
        "name": "add_lead_note",
        "description": "Add a note to a lead's activity timeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "An id from search_leads"},
                "body": {"type": "string"},
            },
            "required": ["lead_id", "body"],
        },
    },
    {
        "name": "create_task",
        "description": "Add a task card to a project's board.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "An id from search_projects"},
                "list_id": {
                    "type": "string",
                    "description": "A column id from get_project_board — defaults to the first column",
                },
                "title": {"type": "string"},
                "description": {"type": "string"},
                "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                "assignee_id": {"type": "string", "description": "An id from list_team_members"},
            },
            "required": ["project_id", "title"],
        },
    },
    {
        "name": "update_task",
        "description": "Change a task: move it to another column, rename it, reschedule it, or (re)assign it. "
        "Only the fields you pass change; pass null for due_date or assignee_id to clear it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "An id from search_projects"},
                "task_id": {"type": "string", "description": "A task id from get_project_board"},
                "list_id": {"type": "string", "description": "A column id from get_project_board"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "due_date": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
                "assignee_id": {"type": ["string", "null"], "description": "An id from list_team_members"},
            },
            "required": ["project_id", "task_id"],
        },
    },
    {
        "name": "update_project_status",
        "description": "Change a project's status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "An id from search_projects"},
                "status": {"type": "string", "enum": project_statuses},
            },
            "required": ["project_id", "status"],
        },
    },
]

_ACTION_TOOL_NAMES = frozenset(tool["name"] for tool in _ACTION_TOOLS)


def _invoice_status_label(invoice: Invoice, today: datetime) -> str:
    """A small, local re-derivation of invoicing/service.py's private
    ``_display_status`` — kept in sync by hand rather than reaching across
    the module boundary for one label."""
    if invoice.status != STATUS_SENT:
        return invoice.status
    due_cents = invoice.total_cents - invoice.amount_paid_cents
    if due_cents > 0 and invoice.due_date < today:
        return "overdue"
    if 0 < invoice.amount_paid_cents < invoice.total_cents:
        return "partial"
    return STATUS_SENT


def _id_input(tool_input: dict, key: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(tool_input.get(key)))
    except ValueError:
        raise ValueError(
            f"{key} must be an id returned by one of the search tools — never a name or a guess."
        ) from None


async def _member_name(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> str:
    """The display name of an agency member, or a ValueError the model can
    read and correct (rather than the service's own 400 at apply time)."""
    result = await db.execute(
        select(User.full_name)
        .join(AgencyMember, AgencyMember.user_id == User.id)
        .where(AgencyMember.agency_id == agency_id, User.id == user_id)
    )
    name = result.scalar_one_or_none()
    if name is None:
        raise ValueError("assignee_id isn't a member of this agency — use an id from list_team_members.")
    return name


async def _run_tool(db: AsyncSession, agency_id: uuid.UUID, name: str, tool_input: dict) -> object:
    limit = min(max(int(tool_input.get("limit") or 10), 1), 20)
    query = (tool_input.get("query") or "").strip().lower()

    if name == "search_leads":
        from binx_api.modules.leads import service as leads_service  # see generate_dashboard_briefing

        rows = await leads_service.list_leads(db, agency_id, status_filter=tool_input.get("status"))
        matches = [lead for lead, _owner, _client in rows if not query or query in lead.name.lower()]
        return [
            {
                "id": str(lead.id),
                "name": lead.name,
                "status": lead.status,
                "score": lead.score,
                "estimated_value_cents": lead.estimated_value_cents,
                "website": lead.website,
            }
            for lead in matches[:limit]
        ]

    if name == "search_clients":
        clients = await agencies_service.list_clients(db, agency_id)
        matches = [c for c in clients if not query or query in c.name.lower()]
        return [
            {
                "id": str(c.id),
                "name": c.name,
                "is_active": c.is_active,
                "primary_contact_email": c.primary_contact_email,
            }
            for c in matches[:limit]
        ]

    if name == "search_projects":
        rows = await projects_service.list_projects_for_agency(db, agency_id, status_filter=tool_input.get("status"))
        matches = [(p, client_name) for p, client_name, _members in rows if not query or query in p.name.lower()]
        return [
            {
                "id": str(p.id),
                "name": p.name,
                "status": p.status,
                "client": client_name,
                "due_date": p.due_date.isoformat() if p.due_date else None,
            }
            for p, client_name in matches[:limit]
        ]

    if name == "search_invoices":
        raw_status = tool_input.get("status")
        # "overdue"/"partial" are derived labels, not stored ones — filter on
        # the stored status and let list_invoices' own derived-status match
        # narrow it further when one of those was requested.
        status_filter = raw_status if raw_status in ("draft", "sent", "paid", "void") else None
        rows = await invoicing_service.list_invoices(db, agency_id, status_filter=status_filter)
        today = datetime.now(UTC).date()
        items = []
        for invoice, client_name, _project_name in rows:
            label = _invoice_status_label(invoice, today)
            if raw_status and label != raw_status:
                continue
            due_cents = invoice.total_cents - invoice.amount_paid_cents
            items.append(
                {
                    "number": invoice.number,
                    "client": client_name,
                    "status": label,
                    "total": _money(invoice.total_cents, invoice.currency),
                    "amount_due": _money(due_cents, invoice.currency),
                    "due_date": invoice.due_date.isoformat(),
                }
            )
        return items[:limit]

    if name == "get_project_board":
        project = await projects_service.get_project_or_404(db, agency_id, _id_input(tool_input, "project_id"))
        board = await projects_service.get_project_board(db, project.id)
        return {
            "project": project.name,
            "status": project.status,
            "columns": [
                {
                    "id": str(task_list.id),
                    "name": task_list.name,
                    "tasks": [
                        {
                            "id": str(task.id),
                            "title": task.title,
                            "assignee": assignee_name,
                            "due_date": task.due_date.isoformat() if task.due_date else None,
                        }
                        for task, assignee_name, *_rest in tasks
                    ],
                }
                for task_list, tasks in board
            ],
        }

    if name == "list_team_members":
        members = await agencies_service.list_agency_members(db, agency_id)
        return [{"id": str(user.id), "name": user.full_name, "role": member.role} for member, user, *_rest in members]

    return {"error": f"Unknown tool '{name}'"}


@dataclass
class _PlannedAction:
    """A validated change, ready to run: ``summary`` is what the member sees
    on the Approve/Decline card; ``apply`` performs it and returns the
    one-line outcome."""

    summary: str
    apply: Callable[[], Awaitable[str]]


async def _plan_action(db: AsyncSession, agency: Agency, actor: User, name: str, tool_input: dict) -> _PlannedAction:
    """Validates one action-tool call against live data — ids resolve, the
    values pass the same schemas the API's own endpoints use — and returns
    what it would do, without doing it. Raises (ValueError, ValidationError,
    or the service's HTTPException) when the call is bad, which the tool loop
    hands back to Claude to correct. Run again at approval time, so an
    approval acts on the data as it is then, not as it was when proposed."""
    from binx_api.modules.leads import service as leads_service  # see generate_dashboard_briefing

    if name == "create_lead":
        lead_data = LeadCreate.model_validate({**tool_input, "source": "manual"})

        async def apply_create_lead() -> str:
            lead = await leads_service.create_lead(db, agency, actor=actor, **lead_data.model_dump())
            return f'Created the lead "{lead.name}".'

        return _PlannedAction(f'Create the lead "{lead_data.name}"', apply_create_lead)

    if name == "update_lead_status":
        status_data = LeadStatusUpdate.model_validate(tool_input)
        lead = await leads_service.get_lead_or_404(db, agency.id, _id_input(tool_input, "lead_id"))
        lead_name, from_status = lead.name, lead.status
        reason = f" ({status_data.lost_reason})" if status_data.status == "lost" and status_data.lost_reason else ""

        async def apply_lead_status() -> str:
            await leads_service.change_status(
                db, lead, new_status=status_data.status, lost_reason=status_data.lost_reason, actor=actor
            )
            return f'Moved "{lead_name}" to {status_data.status}.'

        return _PlannedAction(
            f'Move the lead "{lead_name}" from {from_status} to {status_data.status}{reason}', apply_lead_status
        )

    if name == "add_lead_note":
        note = LeadNoteCreate.model_validate(tool_input)
        lead = await leads_service.get_lead_or_404(db, agency.id, _id_input(tool_input, "lead_id"))
        lead_name = lead.name

        async def apply_lead_note() -> str:
            await leads_service.add_note(db, lead, body=note.body, actor=actor)
            return f'Added a note to "{lead_name}".'

        preview = note.body if len(note.body) <= 120 else f"{note.body[:117]}…"
        return _PlannedAction(f'Add a note to the lead "{lead_name}": "{preview}"', apply_lead_note)

    if name == "create_task":
        project = await projects_service.get_project_or_404(db, agency.id, _id_input(tool_input, "project_id"))
        if tool_input.get("list_id"):
            task_list = await projects_service.get_task_list_or_404(db, project.id, _id_input(tool_input, "list_id"))
        else:
            board = await projects_service.get_project_board(db, project.id)
            if not board:
                raise ValueError(f'"{project.name}" has no board columns to add a task to.')
            task_list = board[0][0]
        task_data = TaskCreate.model_validate({**tool_input, "list_id": task_list.id})
        details = [f'Add the task "{task_data.title}" to {project.name} › {task_list.name}']
        if task_data.assignee_id:
            details.append(f"assigned to {await _member_name(db, agency.id, task_data.assignee_id)}")
        if task_data.due_date:
            details.append(f"due {task_data.due_date.isoformat()}")

        async def apply_create_task() -> str:
            await projects_service.create_task(db, project, **task_data.model_dump(), actor=actor)
            return f'Added "{task_data.title}" to {project.name}.'

        return _PlannedAction(", ".join(details), apply_create_task)

    if name == "update_task":
        project = await projects_service.get_project_or_404(db, agency.id, _id_input(tool_input, "project_id"))
        task = await projects_service.get_task_or_404(db, project.id, _id_input(tool_input, "task_id"))
        current = {
            "list_id": task.list_id,
            "title": task.title,
            "description": task.description,
            "due_date": task.due_date,
            "assignee_id": task.assignee_id,
        }
        task_data = TaskUpdate.model_validate({**current, **{k: tool_input[k] for k in current if k in tool_input}})

        changes = []
        if task_data.list_id != task.list_id:
            task_list = await projects_service.get_task_list_or_404(db, project.id, task_data.list_id)
            changes.append(f"move it to {task_list.name}")
        if task_data.title != task.title:
            changes.append(f'rename it "{task_data.title}"')
        if task_data.description != task.description:
            changes.append("update its description")
        if task_data.due_date != task.due_date:
            changes.append(
                f"make it due {task_data.due_date.isoformat()}" if task_data.due_date else "clear its due date"
            )
        if task_data.assignee_id != task.assignee_id:
            changes.append(
                f"assign it to {await _member_name(db, agency.id, task_data.assignee_id)}"
                if task_data.assignee_id
                else "unassign it"
            )
        if not changes:
            raise ValueError("That wouldn't change anything — pass at least one field with a new value.")
        task_title = task.title

        async def apply_update_task() -> str:
            await projects_service.update_task(db, task, **task_data.model_dump(), actor=actor)
            return f'Updated "{task_title}".'

        return _PlannedAction(
            f'Update the task "{task_title}" in {project.name}: {", ".join(changes)}', apply_update_task
        )

    if name == "update_project_status":
        new_status = str(tool_input.get("status") or "")
        if new_status not in project_statuses:
            raise ValueError(f"status must be one of: {', '.join(project_statuses)}")
        project = await projects_service.get_project_or_404(db, agency.id, _id_input(tool_input, "project_id"))
        project_name, from_status = project.name, project.status

        async def apply_project_status() -> str:
            await projects_service.update_project(
                db,
                project,
                client_id=project.client_id,
                name=project.name,
                description=project.description,
                status_=new_status,
                start_date=project.start_date,
                due_date=project.due_date,
                default_hourly_rate_cents=project.default_hourly_rate_cents,
            )
            return f'Set "{project_name}" to {new_status}.'

        return _PlannedAction(
            f'Change the project "{project_name}" from {from_status} to {new_status}', apply_project_status
        )

    raise ValueError(f"Unknown action '{name}'")


def _error_text(exc: Exception) -> str:
    """A readable one-liner for a failed tool call or action — what Claude
    gets back to correct itself, and what an action card shows on failure."""
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    if isinstance(exc, ValidationError):
        return "; ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}" if error["loc"] else error["msg"]
            for error in exc.errors()
        )
    return str(exc)


async def _apply(action: AiAction, planned: _PlannedAction) -> None:
    try:
        action.result = (await planned.apply())[:1024]
        action.status = ACTION_APPLIED
    except Exception as exc:  # recorded on the card rather than raised — the turn goes on
        action.result = _error_text(exc)[:1024]
        action.status = ACTION_FAILED


# ---- Ask AI: preferences --------------------------------------------


async def get_preferences(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> AiUserPreferences:
    """The member's saved preferences — or, if they've never saved any, an
    unsaved instance carrying the defaults. Nothing is written on read."""
    result = await db.execute(
        select(AiUserPreferences).where(AiUserPreferences.agency_id == agency_id, AiUserPreferences.user_id == user_id)
    )
    preferences = result.scalar_one_or_none()
    if preferences is None:
        preferences = AiUserPreferences(agency_id=agency_id, user_id=user_id, **PREFERENCE_DEFAULTS)
    return preferences


async def update_preferences(
    db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID, **fields: object
) -> AiUserPreferences:
    preferences = await get_preferences(db, agency_id, user_id)
    for key, value in fields.items():
        setattr(preferences, key, value)
    db.add(preferences)
    await db.commit()
    await db.refresh(preferences)
    return preferences


# ---- Ask AI: conversations ------------------------------------------


async def list_conversations(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> list[AiConversation]:
    result = await db.execute(
        select(AiConversation)
        .where(AiConversation.agency_id == agency_id, AiConversation.user_id == user_id)
        .order_by(AiConversation.created_at.desc())
    )
    return list(result.scalars().all())


async def create_conversation(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> AiConversation:
    conversation = AiConversation(agency_id=agency_id, user_id=user_id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def get_conversation_or_404(
    db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID, conversation_id: uuid.UUID
) -> AiConversation:
    result = await db.execute(
        select(AiConversation).where(
            AiConversation.id == conversation_id,
            AiConversation.agency_id == agency_id,
            AiConversation.user_id == user_id,
        )
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


async def list_conversation_messages(db: AsyncSession, conversation_id: uuid.UUID) -> list[AiConversationMessage]:
    result = await db.execute(
        select(AiConversationMessage)
        .where(AiConversationMessage.conversation_id == conversation_id)
        .order_by(AiConversationMessage.created_at)
    )
    return list(result.scalars().all())


async def list_conversation_actions(db: AsyncSession, conversation_id: uuid.UUID) -> dict[uuid.UUID, list[AiAction]]:
    """Every persisted action in a conversation, keyed by the assistant
    message that made/proposed it, oldest first within each."""
    result = await db.execute(
        select(AiAction)
        .where(AiAction.conversation_id == conversation_id, AiAction.message_id.is_not(None))
        .order_by(AiAction.created_at)
    )
    grouped: dict[uuid.UUID, list[AiAction]] = {}
    for action in result.scalars().all():
        assert action.message_id is not None
        grouped.setdefault(action.message_id, []).append(action)
    return grouped


async def delete_conversation(db: AsyncSession, conversation: AiConversation) -> None:
    await db.delete(conversation)
    await db.commit()


async def get_pending_action_or_404(db: AsyncSession, conversation: AiConversation, action_id: uuid.UUID) -> AiAction:
    action = await db.get(AiAction, action_id)
    if action is None or action.conversation_id != conversation.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    if action.status != ACTION_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This change was already {action.status}.")
    return action


async def approve_action(db: AsyncSession, action: AiAction, agency: Agency, *, actor: User) -> AiAction:
    """Runs a pending action on the member's Approve — re-validated against
    the data as it is now (see _plan_action), so approving a stale proposal
    fails cleanly onto the card instead of acting on something that moved."""
    preferences = await get_preferences(db, agency.id, actor.id)
    if not preferences.allow_actions:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "AI changes are turned off — turn them back on in Ask AI settings first."
        )
    try:
        planned = await _plan_action(db, agency, actor, action.tool, json.loads(action.input))
    except Exception as exc:
        action.status, action.result = ACTION_FAILED, _error_text(exc)[:1024]
    else:
        await _apply(action, planned)
    await db.commit()
    await db.refresh(action)
    return action


async def decline_action(db: AsyncSession, action: AiAction) -> AiAction:
    action.status = ACTION_DECLINED
    await db.commit()
    await db.refresh(action)
    return action


# ---- Ask AI: the tool loop ------------------------------------------

_LENGTH_GUIDANCE = {
    "concise": "Keep answers short — a sentence or two, or a tight list. No preamble.",
    "balanced": "Be concise and specific.",
    "detailed": "Give thorough answers: walk through the specifics and your reasoning.",
}
_REPLY_MAX_TOKENS = {"concise": 800, "balanced": 1200, "detailed": 2000}
_TONE_GUIDANCE = {
    "professional": "Use a clear, professional tone.",
    "friendly": "Use a warm, friendly tone.",
    "casual": "Use a relaxed, casual tone.",
}


def _assistant_system_prompt(agency: Agency, preferences: AiUserPreferences) -> str:
    parts = [
        f'You are Binx\'s in-app AI assistant for the agency "{agency.name}". Answer questions about '
        "their leads, clients, projects, tasks, and invoices using the tools available — always look things "
        "up rather than guessing at numbers, statuses, or ids.",
        f"{_LENGTH_GUIDANCE[preferences.response_length]} {_TONE_GUIDANCE[preferences.tone]}",
        f"Today is {datetime.now(UTC).date().isoformat()}.",
    ]
    if not preferences.allow_actions:
        parts.append(
            "You are read-only for this member: they've turned off AI changes, so you can't create, edit, or "
            "change anything. If they ask you to, say so and point them to the settings menu in Ask AI."
        )
    else:
        when = (
            "Each change you request is shown to the member as a proposal with Approve/Decline buttons and only "
            "happens once they approve it — so after requesting one, say what you've proposed, and never claim "
            "it's done."
            if preferences.confirm_actions
            else "Changes take effect immediately, so only make the ones the member clearly asked for, and say "
            "what you did afterwards."
        )
        parts.append(
            "You can also make changes for the member with the action tools: create leads, move leads through "
            "the pipeline, add lead notes, create and update tasks, and change project status. Only make changes "
            "they asked for. Look up every id with the read tools first — never guess one. You can't change "
            f"invoices or clients, or delete anything; say so if asked. {when}"
        )
    if preferences.custom_instructions:
        parts.append(
            "The member's own standing instructions (follow them unless they conflict with the above):\n"
            + preferences.custom_instructions
        )
    return "\n\n".join(parts)


_ACTION_STATUS_NOTES = {
    ACTION_PENDING: "awaiting the member's approval",
    ACTION_APPLIED: "done",
    ACTION_DECLINED: "declined by the member",
    ACTION_FAILED: "failed",
}


async def _build_assistant_messages(db: AsyncSession, conversation: AiConversation, user_message: str) -> list[dict]:
    """The conversation so far as Claude messages. Each past assistant turn
    carries a note of the changes it made/proposed and where they stand now
    (an approval happens after the turn ends), so Claude knows what's
    already been done without replaying the old tool calls."""
    history = await list_conversation_messages(db, conversation.id)
    actions_by_message = await list_conversation_actions(db, conversation.id)
    messages: list[dict] = []
    for m in history:
        content = m.content
        if m.id in actions_by_message:
            notes = "\n".join(f"- {a.summary} ({_ACTION_STATUS_NOTES[a.status]})" for a in actions_by_message[m.id])
            content += f"\n\n[Changes from this turn:\n{notes}]"
        messages.append({"role": m.role, "content": content})
    messages.append({"role": "user", "content": user_message})
    return messages


@dataclass
class _AssistantTurn:
    """One user message's pass through the tool loop — what the loop needs to
    run tools, and the actions it collects along the way."""

    db: AsyncSession
    conversation: AiConversation
    agency: Agency
    actor: User
    preferences: AiUserPreferences
    actions: list[AiAction] = field(default_factory=list)


async def _handle_action_call(turn: _AssistantTurn, name: str, tool_input: dict) -> dict:
    if not turn.preferences.allow_actions:
        raise ValueError("This member has turned off AI changes in their Ask AI settings.")
    planned = await _plan_action(turn.db, turn.agency, turn.actor, name, tool_input)
    action = AiAction(
        conversation_id=turn.conversation.id,
        tool=name,
        input=json.dumps(tool_input),
        summary=planned.summary[:500],
        status=ACTION_PENDING,
    )
    turn.db.add(action)
    # Flushed now (not at the turn's end) so the streamed card has its id.
    await turn.db.flush()
    turn.actions.append(action)
    if turn.preferences.confirm_actions:
        return {
            "status": "awaiting_approval",
            "proposed": action.summary,
            "note": "Shown to the member with Approve/Decline buttons. It has NOT happened yet.",
        }
    await _apply(action, planned)
    return {"status": action.status, "result": action.result}


async def _execute_tool_calls(turn: _AssistantTurn, message) -> list[dict]:
    """Runs every ``tool_use`` block in one assistant message and returns all
    their results as a list of ``tool_result`` blocks for a single user
    message — never split across messages (that silently trains Claude to
    stop making parallel tool calls)."""
    tool_results = []
    for block in message.content:
        if block.type != "tool_use":
            continue
        try:
            if block.name in _ACTION_TOOL_NAMES:
                output = await _handle_action_call(turn, block.name, block.input or {})
            else:
                output = await _run_tool(turn.db, turn.agency.id, block.name, block.input or {})
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(output)})
        except Exception as exc:  # a bad tool call shouldn't kill the whole turn
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": _error_text(exc), "is_error": True}
            )
    return tool_results


async def _persist_assistant_turn(turn: _AssistantTurn, *, user_message: str, final_text: str) -> AiConversationMessage:
    db, conversation = turn.db, turn.conversation
    db.add(AiConversationMessage(conversation_id=conversation.id, role=ROLE_USER, content=user_message))
    reply = AiConversationMessage(conversation_id=conversation.id, role=ROLE_ASSISTANT, content=final_text)
    db.add(reply)
    # Flushed before linking: AiAction has no ORM relationship to the
    # message, so the unit of work wouldn't know to insert the message first.
    await db.flush()
    for action in turn.actions:
        action.message_id = reply.id
    if conversation.title is None:
        conversation.title = user_message[:255]
    await db.commit()
    return reply


async def _start_turn(
    db: AsyncSession, conversation: AiConversation, agency: Agency, actor: User, user_message: str
) -> tuple[_AssistantTurn, list[dict], dict]:
    preferences = await get_preferences(db, agency.id, actor.id)
    turn = _AssistantTurn(db=db, conversation=conversation, agency=agency, actor=actor, preferences=preferences)
    messages = await _build_assistant_messages(db, conversation, user_message)
    call_kwargs = {
        "feature": FEATURE_ASSISTANT,
        "system": _assistant_system_prompt(agency, preferences),
        "max_tokens": _REPLY_MAX_TOKENS[preferences.response_length],
        "effort": "medium",
        # Action tools are only offered when the member allows changes, so
        # Claude doesn't try (and fail) to use them otherwise.
        "tools": _ASSISTANT_TOOLS + (_ACTION_TOOLS if preferences.allow_actions else []),
        "cache_system": True,
    }
    return turn, messages, call_kwargs


_NO_ANSWER = "I wasn't able to finish looking that up — try narrowing your question."


async def assistant_reply(
    db: AsyncSession, conversation: AiConversation, agency: Agency, *, actor: User, user_message: str
) -> AiConversationMessage:
    """Runs one user message through the tool loop and returns the persisted
    assistant reply (its actions are linked by ``message_id``)."""
    turn, messages, call_kwargs = await _start_turn(db, conversation, agency, actor, user_message)

    final_text = _NO_ANSWER
    for _iteration in range(MAX_ASSISTANT_ITERATIONS):
        result = await ai_client.complete(db, agency.id, actor.id, messages=messages, **call_kwargs)
        message = result.message
        if message.stop_reason != "tool_use":
            final_text = result.text or final_text
            break

        messages.append({"role": "assistant", "content": message.content})
        tool_results = await _execute_tool_calls(turn, message)
        messages.append({"role": "user", "content": tool_results})

    return await _persist_assistant_turn(turn, user_message=user_message, final_text=final_text)


async def assistant_reply_stream(
    db: AsyncSession, conversation: AiConversation, agency: Agency, *, actor: User, user_message: str
) -> AsyncIterator[str | AiAction]:
    """Streaming counterpart to :func:`assistant_reply` — the exact same
    tool loop (still capped at ``MAX_ASSISTANT_ITERATIONS``, still runs every
    ``tool_use`` block from one message and returns all results in one user
    message) and the exact same persistence (one commit at the end, same two
    ``AiConversationMessage`` rows) — only the client-visible delivery is
    incremental: yields text deltas as each iteration's reply is generated,
    and each ``AiAction`` as soon as its tool call has been handled (pending
    or already applied), instead of returning the finished text once. An
    iteration that's purely a tool call yields no deltas (nothing to show
    yet), so what streams to the user is naturally just the assistant's
    visible reasoning and its final answer."""
    turn, messages, call_kwargs = await _start_turn(db, conversation, agency, actor, user_message)

    final_text = _NO_ANSWER
    for _iteration in range(MAX_ASSISTANT_ITERATIONS):
        message = None
        turn_text = ""
        async for event in ai_client.complete_stream(db, agency.id, actor.id, messages=messages, **call_kwargs):
            if isinstance(event, ai_client.TextDelta):
                turn_text += event.text
                yield event.text
            else:
                message = event.message

        assert message is not None  # complete_stream always ends with a TurnComplete
        if message.stop_reason != "tool_use":
            final_text = turn_text or final_text
            break

        messages.append({"role": "assistant", "content": message.content})
        seen = len(turn.actions)
        tool_results = await _execute_tool_calls(turn, message)
        messages.append({"role": "user", "content": tool_results})
        for action in turn.actions[seen:]:
            yield action

    await _persist_assistant_turn(turn, user_message=user_message, final_text=final_text)
