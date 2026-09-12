import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.agencies.schemas import AgencyClientRead
from binx_api.modules.ai import service as ai_service
from binx_api.modules.ai.schemas import AiDraftRead
from binx_api.modules.leads import service
from binx_api.modules.leads.models import Lead
from binx_api.modules.leads.schemas import (
    BulkAnalyzeRead,
    LeadCreate,
    LeadEventRead,
    LeadGenerateRequest,
    LeadGenerateResponse,
    LeadImportRequest,
    LeadImportResponse,
    LeadListRead,
    LeadNoteCreate,
    LeadOwnerUpdate,
    LeadRead,
    LeadStatusUpdate,
    LeadUpdate,
    ProspectRead,
)

router = APIRouter(prefix="/agencies/{agency_id}/leads", tags=["leads"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
AgencyAndRole = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _list_read(lead: Lead, owner_name: str | None, converted_client_name: str | None) -> LeadListRead:
    return LeadListRead(
        id=lead.id,
        agency_id=lead.agency_id,
        name=lead.name,
        contact_name=lead.contact_name,
        contact_email=lead.contact_email,
        website=lead.website,
        status=lead.status,
        source=lead.source,
        owner_id=lead.owner_id,
        owner_name=owner_name,
        score=lead.score,
        estimated_value_cents=lead.estimated_value_cents,
        last_activity_at=lead.last_activity_at,
        converted_client_id=lead.converted_client_id,
        created_at=lead.created_at,
    )


def _decode_points(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [str(p) for p in value if str(p).strip()] if isinstance(value, list) else []


def _detail_read(lead: Lead, owner_name: str | None, converted_client_name: str | None) -> LeadRead:
    return LeadRead(
        **_list_read(lead, owner_name, converted_client_name).model_dump(),
        contact_phone=lead.contact_phone,
        notes=lead.notes,
        ai_summary=lead.ai_summary,
        ai_talking_points=_decode_points(lead.ai_talking_points),
        ai_next_step=lead.ai_next_step,
        ai_fit=lead.ai_fit,
        ai_analyzed_at=lead.ai_analyzed_at,
        lost_reason=lead.lost_reason,
        converted_client_name=converted_client_name,
        converted_at=lead.converted_at,
        updated_at=lead.updated_at,
    )


async def _reload_detail(db: DbSession, lead: Lead) -> LeadRead:
    return _detail_read(lead, await service.owner_name(db, lead), await service.converted_client_name(db, lead))


@router.get("", response_model=list[LeadListRead])
async def list_leads(
    db: DbSession,
    agency_and_role: AnyMember,
    lead_status: str | None = Query(default=None, alias="status"),
    owner_id: uuid.UUID | None = None,
    source: str | None = None,
) -> list[LeadListRead]:
    agency, _role = agency_and_role
    rows = await service.list_leads(db, agency.id, status_filter=lead_status, owner_id=owner_id, source=source)
    return [_list_read(lead, owner, client) for lead, owner, client in rows]


@router.post("", response_model=LeadRead, status_code=status.HTTP_201_CREATED)
async def create_lead(
    db: DbSession, data: LeadCreate, current_user: CurrentUser, agency_and_role: AnyMember
) -> LeadRead:
    agency, _role = agency_and_role
    lead = await service.create_lead(
        db,
        agency,
        actor=current_user,
        name=data.name,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        website=data.website,
        source=data.source,
        estimated_value_cents=data.estimated_value_cents,
        notes=data.notes,
    )
    return await _reload_detail(db, lead)


@router.post("/analyze", response_model=BulkAnalyzeRead)
async def analyze_open_leads(db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember) -> BulkAnalyzeRead:
    agency, _role = agency_and_role
    result = await service.analyze_open_leads(db, agency, actor=current_user)
    return BulkAnalyzeRead(
        analyzed=result.analyzed,
        skipped=result.skipped,
        leads=[_list_read(lead, None, None) for lead in result.leads],
    )


@router.post("/generate", response_model=LeadGenerateResponse)
async def generate_leads(
    db: DbSession, data: LeadGenerateRequest, current_user: CurrentUser, agency_and_role: AnyMember
) -> LeadGenerateResponse:
    agency, _role = agency_and_role
    candidates = await ai_service.find_prospects(db, agency, actor=current_user, brief=data.model_dump())
    return LeadGenerateResponse(
        brief=data,
        candidates=[ProspectRead.model_validate(c, from_attributes=True) for c in candidates],
    )


@router.post("/import", response_model=LeadImportResponse, status_code=status.HTTP_201_CREATED)
async def import_leads(
    db: DbSession, data: LeadImportRequest, current_user: CurrentUser, agency_and_role: AnyMember
) -> LeadImportResponse:
    agency, _role = agency_and_role
    result = await service.import_prospects(
        db, agency, actor=current_user, candidates=[c.model_dump() for c in data.candidates]
    )
    return LeadImportResponse(
        imported=[await _reload_detail(db, lead) for lead in result.imported],
        skipped=result.skipped,
    )


@router.get("/{lead_id}", response_model=LeadRead)
async def read_lead(db: DbSession, lead_id: uuid.UUID, agency_and_role: AnyMember) -> LeadRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    return await _reload_detail(db, lead)


@router.patch("/{lead_id}", response_model=LeadRead)
async def update_lead(db: DbSession, lead_id: uuid.UUID, data: LeadUpdate, agency_and_role: AnyMember) -> LeadRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    lead = await service.update_lead(
        db,
        lead,
        name=data.name,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        website=data.website,
        source=data.source,
        estimated_value_cents=data.estimated_value_cents,
        notes=data.notes,
    )
    return await _reload_detail(db, lead)


@router.patch("/{lead_id}/status", response_model=LeadRead)
async def change_status(
    db: DbSession, lead_id: uuid.UUID, data: LeadStatusUpdate, current_user: CurrentUser, agency_and_role: AnyMember
) -> LeadRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    lead = await service.change_status(
        db, lead, new_status=data.status, lost_reason=data.lost_reason, actor=current_user
    )
    return await _reload_detail(db, lead)


@router.patch("/{lead_id}/owner", response_model=LeadRead)
async def assign_owner(
    db: DbSession, lead_id: uuid.UUID, data: LeadOwnerUpdate, current_user: CurrentUser, agency_and_role: AnyMember
) -> LeadRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    lead = await service.assign_owner(db, lead, agency.id, owner_id=data.owner_id, actor=current_user)
    return await _reload_detail(db, lead)


@router.get("/{lead_id}/events", response_model=list[LeadEventRead])
async def list_events(db: DbSession, lead_id: uuid.UUID, agency_and_role: AnyMember) -> list[LeadEventRead]:
    agency, _role = agency_and_role
    await service.get_lead_or_404(db, agency.id, lead_id)
    events = await service.list_events(db, lead_id)
    return [
        LeadEventRead(
            id=e.id, lead_id=e.lead_id, kind=e.kind, body=e.body, actor_name=e.actor_name, created_at=e.created_at
        )
        for e in events
    ]


@router.post("/{lead_id}/events", response_model=LeadEventRead, status_code=status.HTTP_201_CREATED)
async def add_note(
    db: DbSession, lead_id: uuid.UUID, data: LeadNoteCreate, current_user: CurrentUser, agency_and_role: AnyMember
) -> LeadEventRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    event = await service.add_note(db, lead, body=data.body, actor=current_user)
    return LeadEventRead(
        id=event.id,
        lead_id=event.lead_id,
        kind=event.kind,
        body=event.body,
        actor_name=event.actor_name,
        created_at=event.created_at,
    )


@router.post("/{lead_id}/convert", response_model=AgencyClientRead)
async def convert_lead(
    db: DbSession, lead_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> AgencyClientRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    client = await service.convert_lead(db, lead, agency, actor=current_user)
    return AgencyClientRead.model_validate(client)


@router.post("/{lead_id}/analyze", response_model=LeadRead)
async def analyze_lead(
    db: DbSession, lead_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> LeadRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    lead = await service.analyze_lead(db, lead, actor=current_user)
    return await _reload_detail(db, lead)


@router.post("/{lead_id}/ai/follow-up", response_model=AiDraftRead)
async def generate_lead_ai_followup(
    db: DbSession, lead_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> AiDraftRead:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    draft = await ai_service.generate_lead_followup(db, lead, agency, actor=current_user)
    return AiDraftRead(draft=draft)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(db: DbSession, lead_id: uuid.UUID, agency_and_role: AgencyAndRole) -> None:
    agency, _role = agency_and_role
    lead = await service.get_lead_or_404(db, agency.id, lead_id)
    await service.delete_lead(db, lead)
