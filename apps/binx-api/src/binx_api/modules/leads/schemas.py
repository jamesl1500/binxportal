import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

_STATUS_PATTERN = "^(new|contacted|qualified|proposal|won|lost)$"
_SOURCE_PATTERN = "^(manual|referral|inbound|import|ai_generated)$"


class LeadBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=32)
    website: str | None = Field(default=None, max_length=2048)
    source: str = Field(default="manual", pattern=_SOURCE_PATTERN)
    estimated_value_cents: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=8192)


class LeadCreate(LeadBase):
    pass


class LeadUpdate(LeadBase):
    """A full replace of the editable fields — the edit form submits every
    field together (same as AgencyClientUpdate)."""


class LeadStatusUpdate(BaseModel):
    status: str = Field(pattern=_STATUS_PATTERN)
    lost_reason: str | None = Field(default=None, max_length=1024)


class LeadOwnerUpdate(BaseModel):
    owner_id: uuid.UUID | None = None


class LeadNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2048)


class LeadListRead(BaseModel):
    id: uuid.UUID
    agency_id: uuid.UUID
    name: str
    contact_name: str | None
    contact_email: str | None
    website: str | None
    status: str
    source: str
    owner_id: uuid.UUID | None
    owner_name: str | None
    score: int | None
    estimated_value_cents: int | None
    last_activity_at: datetime | None
    converted_client_id: uuid.UUID | None
    created_at: datetime


class LeadRead(LeadListRead):
    contact_phone: str | None
    notes: str | None
    ai_summary: str | None
    ai_talking_points: list[str] = []
    ai_next_step: str | None = None
    ai_fit: str | None = None
    ai_analyzed_at: datetime | None
    lost_reason: str | None
    converted_client_name: str | None
    converted_at: datetime | None
    updated_at: datetime | None = None


class LeadEventRead(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    kind: str
    body: str
    actor_name: str | None
    created_at: datetime


class BulkAnalyzeRead(BaseModel):
    analyzed: int
    skipped: int
    leads: list[LeadListRead]


class LeadGenerateRequest(BaseModel):
    # When set, the saved search's own fields are used and the rest of this
    # body is ignored — see leads/router.py::generate_leads.
    criteria_id: uuid.UUID | None = None
    industry: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    radius_miles: int | None = Field(default=None, ge=1, le=500)
    company_size: str | None = Field(default=None, max_length=100)
    keywords: str | None = Field(default=None, max_length=500)
    count: int = Field(default=5, ge=1, le=10)


class ProspectRead(BaseModel):
    name: str
    website: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    estimated_value_cents: int | None = None
    rationale: str | None = None
    source: str = "web_search"


class LeadGenerateResponse(BaseModel):
    brief: LeadGenerateRequest
    candidates: list[ProspectRead]


class LeadImportRequest(BaseModel):
    candidates: list[ProspectRead] = Field(min_length=1, max_length=25)


class LeadImportResponse(BaseModel):
    imported: list[LeadRead]
    skipped: list[dict]


class LeadSearchCriteriaBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    radius_miles: int | None = Field(default=None, ge=1, le=500)
    company_size: str | None = Field(default=None, max_length=100)
    keywords: str | None = Field(default=None, max_length=500)
    count: int = Field(default=5, ge=1, le=10)


class LeadSearchCriteriaCreate(LeadSearchCriteriaBase):
    pass


class LeadSearchCriteriaUpdate(LeadSearchCriteriaBase):
    """A full replace of the editable fields — same shape as LeadUpdate."""


class LeadSearchCriteriaRead(LeadSearchCriteriaBase):
    id: uuid.UUID
    agency_id: uuid.UUID
    last_run_at: datetime | None
    last_run_result_count: int | None
    created_at: datetime
