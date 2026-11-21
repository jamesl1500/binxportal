from typing import Literal

from pydantic import BaseModel, Field

ImportKind = Literal["clients", "team", "leads", "projects", "tasks", "time_entries"]

# Per-file row caps. Kept modest so an import is one ordinary request — no
# background job, no stored upload.
MAX_CLIENT_ROWS = 500
MAX_TEAM_ROWS = 100
MAX_LEAD_ROWS = 500
# Each project is created through the normal path (slug, default columns,
# creator membership), one commit per row, so this cap is lower.
MAX_PROJECT_ROWS = 200
MAX_TASK_ROWS = 1000
MAX_TIME_ENTRY_ROWS = 2000

MAX_ROWS_BY_KIND: dict[str, int] = {
    "clients": MAX_CLIENT_ROWS,
    "team": MAX_TEAM_ROWS,
    "leads": MAX_LEAD_ROWS,
    "projects": MAX_PROJECT_ROWS,
    "tasks": MAX_TASK_ROWS,
    "time_entries": MAX_TIME_ENTRY_ROWS,
}

# Loose bound on any single raw value; the real per-field limits are applied
# by the same schemas the single-item forms use (see service.py).
RawValue = str | None


class ImportFieldRead(BaseModel):
    key: str
    label: str
    required: bool


class ImportParsedRow(BaseModel):
    row: int  # the spreadsheet's own row number
    cells: list[str]


class ImportParseRead(BaseModel):
    """The raw sheet plus a suggested column → field mapping. The client lets
    the user adjust the mapping, then sends mapped rows to the import endpoint."""

    columns: list[str]
    rows: list[ImportParsedRow]
    fields: list[ImportFieldRead]
    # field key → column index (None = not mapped)
    mapping: dict[str, int | None]


class ClientImportRow(BaseModel):
    row: int = Field(ge=1)
    name: RawValue = Field(default=None, max_length=10_000)
    primary_contact_name: RawValue = Field(default=None, max_length=10_000)
    primary_contact_email: RawValue = Field(default=None, max_length=10_000)
    primary_contact_phone: RawValue = Field(default=None, max_length=10_000)
    website: RawValue = Field(default=None, max_length=10_000)
    notes: RawValue = Field(default=None, max_length=10_000)
    billing_email: RawValue = Field(default=None, max_length=10_000)
    billing_address: RawValue = Field(default=None, max_length=10_000)


class ClientImportRequest(BaseModel):
    rows: list[ClientImportRow] = Field(min_length=1, max_length=MAX_CLIENT_ROWS)
    # True = validate and report only (the Review step); False = actually import.
    dry_run: bool = True


class TeamImportRow(BaseModel):
    row: int = Field(ge=1)
    email: RawValue = Field(default=None, max_length=10_000)
    role: RawValue = Field(default=None, max_length=10_000)


class TeamImportRequest(BaseModel):
    rows: list[TeamImportRow] = Field(min_length=1, max_length=MAX_TEAM_ROWS)
    dry_run: bool = True


def _raw() -> RawValue:
    return Field(default=None, max_length=10_000)


class LeadImportRow(BaseModel):
    row: int = Field(ge=1)
    name: RawValue = _raw()
    contact_name: RawValue = _raw()
    contact_email: RawValue = _raw()
    contact_phone: RawValue = _raw()
    website: RawValue = _raw()
    estimated_value: RawValue = _raw()
    status: RawValue = _raw()
    notes: RawValue = _raw()


class LeadImportRequest(BaseModel):
    rows: list[LeadImportRow] = Field(min_length=1, max_length=MAX_LEAD_ROWS)
    dry_run: bool = True


class ProjectImportRow(BaseModel):
    row: int = Field(ge=1)
    name: RawValue = _raw()
    client: RawValue = _raw()
    status: RawValue = _raw()
    description: RawValue = _raw()
    start_date: RawValue = _raw()
    due_date: RawValue = _raw()
    hourly_rate: RawValue = _raw()


class ProjectImportRequest(BaseModel):
    rows: list[ProjectImportRow] = Field(min_length=1, max_length=MAX_PROJECT_ROWS)
    dry_run: bool = True


class TaskImportRow(BaseModel):
    row: int = Field(ge=1)
    project: RawValue = _raw()
    title: RawValue = _raw()
    column: RawValue = _raw()
    description: RawValue = _raw()
    due_date: RawValue = _raw()
    assignee: RawValue = _raw()


class TaskImportRequest(BaseModel):
    rows: list[TaskImportRow] = Field(min_length=1, max_length=MAX_TASK_ROWS)
    dry_run: bool = True


class TimeEntryImportRow(BaseModel):
    row: int = Field(ge=1)
    date: RawValue = _raw()
    hours: RawValue = _raw()
    project: RawValue = _raw()
    task: RawValue = _raw()
    member: RawValue = _raw()
    description: RawValue = _raw()
    billable: RawValue = _raw()
    hourly_rate: RawValue = _raw()


class TimeEntryImportRequest(BaseModel):
    rows: list[TimeEntryImportRow] = Field(min_length=1, max_length=MAX_TIME_ENTRY_ROWS)
    dry_run: bool = True


class ImportRowResult(BaseModel):
    row: int
    # What to show for the row in the review table (client name / email).
    label: str
    # ok = imported (or would be, on a dry run); the rest are skipped.
    status: Literal["ok", "duplicate", "invalid", "over_limit"]
    message: str | None = None


class ImportResultRead(BaseModel):
    dry_run: bool
    rows: list[ImportRowResult]
    imported: int
    duplicates: int
    invalid: int
    over_limit: int
    plan_name: str
    # The plan's cap for this resource and how much of it was free before
    # this import; None = unlimited.
    limit: int | None
    remaining: int | None
